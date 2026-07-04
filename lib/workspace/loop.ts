import { and, asc, cosineDistance, eq, ilike, inArray, isNotNull, or, sql } from "drizzle-orm";
import { getPack } from "@/domain-packs";
import { db, schema } from "@/lib/db";
import { chat, chatStream, embed } from "@/lib/llm";
import { orderForContext, plan, type RequiredItem } from "@/lib/memory";
import {
  buildRequiredItem,
  cardPassagesFor,
  loadWorkingSet,
  persistPlan,
  workSummaries,
} from "./memoryStore";
import { parseRouterPicks, stripProvenanceMarkers } from "./provenance";
import { DEFAULT_TOKEN_BUDGET } from "./state";

/**
 * The per-message conversation loop (§11):
 * route → plan memory → synthesize (streaming) → provenance → touch.
 * Emits typed events so the API route can interleave memory_op and
 * answer_delta frames on one SSE wire (§12).
 *
 * H5 interrupt policy: act-and-narrate. ASK_ABOVE_TOKENS is the threshold
 * above which the agent would pause and ask before a large load; the H5
 * default is "never ask" — the constant exists so the demo can flip it.
 */
export const ASK_ABOVE_TOKENS = Number.POSITIVE_INFINITY;

export interface ProvenanceChip {
  passageId: string;
  author: string;
  workTitle: string;
  ordinal: number;
}

export type LoopEvent =
  | { type: "status"; message: string }
  | { type: "memory_op"; op: string; itemType: string; itemId: string; reason: string }
  | { type: "answer_delta"; text: string }
  | { type: "done"; messageId: string; content: string; provenance: ProvenanceChip[] }
  | { type: "error"; message: string };

const ROUTER_PICK_CAP = 4;
const RETRIEVAL_TOP_K = 6;

/** §11 step 1 — the router decides what the answer needs. */
async function routeMessage(input: {
  packId: string;
  workspaceId: string;
  message: string;
}): Promise<Array<{ type: "card" | "work"; id: string }>> {
  const cards = await db.query.conceptCards.findMany({
    where: eq(schema.conceptCards.packId, input.packId),
    columns: { id: true, title: true, authorScope: true },
  });
  const works = await db.query.works.findMany({
    where: and(
      eq(schema.works.packId, input.packId),
      eq(schema.works.status, "ingested"),
    ),
    columns: { id: true, title: true, author: true },
  });

  const index = [
    "CONCEPT CARDS:",
    ...cards.map((c) => `- card ${c.id} :: ${c.title} [${c.authorScope.join(", ")}]`),
    "WORKS:",
    ...works.map((w) => `- work ${w.id} :: ${w.title} (${w.author})`),
  ].join("\n");

  const result = await chat("router", {
    system:
      "You route a reader's question to source material. From the index, pick the entries the answer needs — " +
      `at most ${ROUTER_PICK_CAP}, fewer is better. Prefer cards over whole works. ` +
      'Reply with strict JSON only: {"items":[{"type":"card"|"work","id":"<id from the index>"}]}. ' +
      'If nothing in the index covers the question, reply {"items":[]}.',
    prompt: `${index}\n\nQuestion: ${input.message}`,
    json: true,
    // gpt-oss-20b is a reasoning model — it spends tokens on hidden
    // reasoning before emitting the JSON answer. At 300 this reliably
    // produced empty output, which Groq's strict json mode then rejects
    // as a 400 (verified live: the router silently "failed" on every
    // single call and every answer fell back to keyword retrieval).
    maxTokens: 1500,
    temperature: 0,
    workspaceId: input.workspaceId,
  });

  const validIds = new Set([...cards.map((c) => c.id), ...works.map((w) => w.id)]);
  return parseRouterPicks(result.text)
    .filter((p) => validIds.has(p.id))
    .slice(0, ROUTER_PICK_CAP);
}

/**
 * §11.4 retrieval fallback — no card coverage. pgvector over summaries when
 * embeddings + the local embed model exist; otherwise a keyword scan over
 * summaries so answers stay grounded even before embeddings are backfilled.
 */
async function retrievalFallback(input: {
  packId: string;
  message: string;
}): Promise<string[]> {
  const embedded = await db
    .select({ id: schema.passages.id })
    .from(schema.passages)
    .where(isNotNull(schema.passages.embedding))
    .limit(1);

  if (embedded.length > 0) {
    const queryVec = (await embed([input.message]))?.[0];
    if (queryVec) {
      const rows = await db
        .select({ passageId: schema.summaries.passageId })
        .from(schema.summaries)
        .innerJoin(
          schema.passages,
          eq(schema.passages.id, schema.summaries.passageId),
        )
        .where(isNotNull(schema.passages.embedding))
        .orderBy(cosineDistance(schema.passages.embedding, queryVec))
        .limit(RETRIEVAL_TOP_K);
      return rows.map((r) => r.passageId);
    }
  }

  // keyword fallback: the message's longest words against summary text
  const words = [...new Set(input.message.toLowerCase().match(/[a-z]{5,}/g) ?? [])]
    .sort((a, b) => b.length - a.length)
    .slice(0, 4);
  if (words.length === 0) return [];
  const rows = await db
    .select({ passageId: schema.summaries.passageId })
    .from(schema.summaries)
    .innerJoin(
      schema.passages,
      eq(schema.passages.id, schema.summaries.passageId),
    )
    .innerJoin(schema.works, eq(schema.works.id, schema.passages.workId))
    .where(
      and(
        eq(schema.works.packId, input.packId),
        or(...words.map((w) => ilike(schema.summaries.text, `%${w}%`))),
      ),
    )
    .orderBy(asc(schema.passages.ordinal))
    .limit(RETRIEVAL_TOP_K);
  return rows.map((r) => r.passageId);
}

/** Render one working-set item into the model context (§10.2 semantics). */
async function renderItem(item: {
  itemType: string;
  itemId: string;
  state: string;
  title: string;
}): Promise<string> {
  if (item.itemType === "card") {
    const card = await db.query.conceptCards.findFirst({
      where: eq(schema.conceptCards.id, item.itemId),
    });
    if (!card) return "";
    if (item.state === "compressed") {
      return `## Concept card: ${card.title}\n${card.body}`;
    }
    const passages = await cardPassagesFor(item.itemId);
    const passageBlocks = passages.map(
      (p) => `[p:${p.id}] (${p.author}, ${p.workTitle} §${p.ordinal})\n${p.text}`,
    );
    return [`## Concept card: ${card.title}`, card.body, ...passageBlocks].join("\n\n");
  }
  if (item.itemType === "passage") {
    const rows = await db
      .select({
        id: schema.passages.id,
        text: schema.passages.text,
        ordinal: schema.passages.ordinal,
        author: schema.works.author,
        workTitle: schema.works.title,
      })
      .from(schema.passages)
      .innerJoin(schema.works, eq(schema.works.id, schema.passages.workId))
      .where(eq(schema.passages.id, item.itemId))
      .limit(1);
    const p = rows[0];
    if (!p) return "";
    if (item.state === "compressed") {
      return `[compressed passage: ${p.workTitle} §${p.ordinal}]`;
    }
    return `[p:${p.id}] (${p.author}, ${p.workTitle} §${p.ordinal})\n${p.text}`;
  }
  // work_summary
  const summaries = await workSummaries(item.itemId);
  const lines = summaries.map((s) => `[p:${s.passageId}] §${s.ordinal}: ${s.text}`);
  return [`## ${item.title}`, ...lines].join("\n");
}

export async function runConversationTurn(input: {
  workspaceId: string;
  message: string;
  emit: (event: LoopEvent) => void;
}): Promise<void> {
  const { workspaceId, message, emit } = input;
  const workspace = await db.query.workspaces.findFirst({
    where: eq(schema.workspaces.id, workspaceId),
  });
  if (!workspace) {
    emit({ type: "error", message: "Unknown workspace." });
    return;
  }
  const pack = getPack(workspace.packId);

  await db.insert(schema.messages).values({
    workspaceId,
    role: "user",
    content: message,
  });
  const turnRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.messages)
    .where(
      and(
        eq(schema.messages.workspaceId, workspaceId),
        eq(schema.messages.role, "user"),
      ),
    );
  const currentTurn = Number(turnRows[0]?.count ?? 1);

  // 1. route
  emit({ type: "status", message: "Consulting the shelf…" });
  let picks: Array<{ type: "card" | "work"; id: string }> = [];
  try {
    picks = await routeMessage({ packId: workspace.packId, workspaceId, message });
  } catch (err) {
    // Falls back to retrieval, same as a legitimate "nothing matched" —
    // but log server-side so a real router outage is diagnosable instead
    // of looking identical to a router that correctly found no coverage.
    console.error("[loop] router call failed, falling back to retrieval:", err);
    picks = [];
  }

  const required: RequiredItem[] = [];
  for (const pick of picks) {
    const item = await buildRequiredItem(
      pick.type === "card" ? "card" : "work_summary",
      pick.id,
      pick.type === "card" ? 2 : 1,
    );
    if (item) required.push(item);
  }

  let retrieved = false;
  if (required.length === 0) {
    const passageIds = await retrievalFallback({ packId: workspace.packId, message });
    for (const id of passageIds) {
      const item = await buildRequiredItem("passage", id, 1);
      if (item) required.push(item);
    }
    retrieved = required.length > 0;
  }

  if (required[0]) {
    emit({
      type: "status",
      message: `Bringing *${required[0].title}* into memory…`,
    });
  }

  // 2. plan memory + persist + narrate
  const currentSet = await loadWorkingSet(workspaceId);
  const planned = plan({
    currentSet,
    required,
    budgetTokens: DEFAULT_TOKEN_BUDGET,
    currentTurn,
  });
  const ops = retrieved
    ? planned.ops.map((op) =>
        op.op === "hydrate"
          ? { ...op, reason: `${op.reason.replace(/\.$/, "")} — retrieved; no concept card covered this.` }
          : op,
      )
    : planned.ops;
  await persistPlan({ workspaceId, nextSet: planned.nextSet, ops, actor: "agent" });
  for (const op of ops) {
    emit({ type: "memory_op", ...op });
  }

  // 3. synthesize (streaming)
  const ordered = orderForContext(planned.nextSet);
  const contextBlocks: string[] = [];
  for (const item of ordered) {
    const block = await renderItem(item);
    if (block) contextBlocks.push(block);
  }
  const prompt = [
    "WORKING MEMORY:",
    contextBlocks.join("\n\n---\n\n") || "(empty — say so honestly)",
    "\n===\n",
    `Reader's question: ${message}`,
  ].join("\n");

  let fullText = "";
  try {
    const stream = await chatStream("synthesis", {
      system: pack.prompts.answerSystem,
      prompt,
      // gpt-oss-120b's reasoning tokens count against this same budget —
      // verified live: at 1500 with reasoning_format hidden and a large
      // working set, reasoning alone consumed the whole budget and the
      // visible answer came back completely empty. Generous headroom here.
      maxTokens: 4096,
      workspaceId,
    });
    for await (const delta of stream.deltas) {
      fullText += delta;
      emit({ type: "answer_delta", text: delta });
    }
    await stream.result;
  } catch (err) {
    emit({
      type: "error",
      message: err instanceof Error ? err.message : "Synthesis failed.",
    });
    return;
  }

  // 4. provenance
  const { clean, passageIds } = stripProvenanceMarkers(fullText);
  const inserted = await db
    .insert(schema.messages)
    .values({ workspaceId, role: "assistant", content: clean })
    .returning({ id: schema.messages.id });
  const messageId = inserted[0]?.id;
  if (!messageId) {
    emit({ type: "error", message: "Failed to store the answer." });
    return;
  }

  let provenance: ProvenanceChip[] = [];
  if (passageIds.length > 0) {
    const rows = await db
      .select({
        passageId: schema.passages.id,
        ordinal: schema.passages.ordinal,
        author: schema.works.author,
        workTitle: schema.works.title,
      })
      .from(schema.passages)
      .innerJoin(schema.works, eq(schema.works.id, schema.passages.workId))
      .where(inArray(schema.passages.id, passageIds));
    const byId = new Map(rows.map((r) => [r.passageId, r]));
    provenance = passageIds
      .map((id) => byId.get(id))
      .filter((r): r is NonNullable<typeof r> => r !== undefined);
    for (const chip of provenance) {
      await db.insert(schema.messageProvenance).values({
        messageId,
        passageId: chip.passageId,
      });
    }
  }

  emit({ type: "done", messageId, content: clean, provenance });
}
