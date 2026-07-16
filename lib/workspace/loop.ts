import { and, asc, cosineDistance, eq, ilike, inArray, isNotNull, or, sql } from "drizzle-orm";
import { trace } from "@opentelemetry/api";
import { getPack } from "@/domain-packs";
import { db, schema } from "@/lib/db";
import { chat, chatStream, embed } from "@/lib/llm";
import { orderForContext, plan, type RequiredItem } from "@/lib/memory";
import {
  buildRequiredItem,
  cardPassagesFor,
  loadWorkingSet,
  persistPlan,
  relevanceForItems,
  workSummaries,
} from "./memoryStore";
import { parseRouterPicks, stripProvenanceMarkers } from "./provenance";
import { interruptsEnabled, resolveSettings } from "./settings";

/**
 * The per-message conversation loop (§11):
 * route → plan memory → synthesize (streaming) → provenance → touch.
 * Emits typed events so the API route can interleave memory_op and
 * answer_delta frames on one SSE wire (§12).
 *
 * H5 interrupt policy: act-and-narrate by default. When the workspace's
 * `askAboveTokens` setting is finite, a turn whose new hydration exceeds it
 * pauses and asks first (the "pause and ask" alternative). See
 * lib/workspace/settings.ts.
 */

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
  // H5 pause-and-ask: the turn wants to load a large amount and is waiting
  // for the user to approve before anything is persisted or hydrated.
  | { type: "interrupt"; label: string; itemCount: number; incomingTokens: number }
  | { type: "error"; message: string };

const ROUTER_PICK_CAP = 4;
const RETRIEVAL_TOP_K = 6;
// Two-stage routing (retrieve-then-rerank): a cheap embedding pass shortlists
// candidates, then the LLM picks from the shortlist. These bound the router
// prompt regardless of how large the corpus grows — the flat "every card and
// work" index it replaced grew linearly with the shelf.
const CARD_SHORTLIST = 12;
const WORK_SHORTLIST = 6;

/** Timeline rows (§14): meaningful loop steps mirror into `events`. */
async function emitTimelineEvent(
  workspaceId: string,
  kind: string,
  domainMessage: string,
): Promise<void> {
  await db.insert(schema.events).values({
    workspaceId,
    kind,
    domainMessage,
    otelTraceId: trace.getActiveSpan()?.spanContext().traceId ?? null,
  });
}

/**
 * Stage 1 of routing: shortlist candidates by embedding similarity. Cards are
 * ranked by cosine to the query; works by their single nearest passage (works
 * carry no embedding of their own). Returns null when embeddings aren't
 * available — the query couldn't be embedded, or nothing in the pack is
 * embedded yet — so the caller falls back to the full index.
 */
async function shortlistCandidates(input: {
  packId: string;
  queryVec: number[] | null;
}): Promise<{
  cards: Array<{ id: string; title: string; authorScope: string[] }>;
  works: Array<{ id: string; title: string; author: string }>;
} | null> {
  const { queryVec } = input;
  if (!queryVec) return null;

  const cards = await db
    .select({
      id: schema.conceptCards.id,
      title: schema.conceptCards.title,
      authorScope: schema.conceptCards.authorScope,
    })
    .from(schema.conceptCards)
    .where(
      and(
        eq(schema.conceptCards.packId, input.packId),
        isNotNull(schema.conceptCards.embedding),
      ),
    )
    .orderBy(cosineDistance(schema.conceptCards.embedding, queryVec))
    .limit(CARD_SHORTLIST);

  // Rank works by their closest passage — min cosine distance across the
  // work's embedded passages — so a work surfaces when any part of it is
  // on-topic, not only when its average is.
  const nearest = sql<number>`min(${cosineDistance(schema.passages.embedding, queryVec)})`;
  const works = await db
    .select({
      id: schema.works.id,
      title: schema.works.title,
      author: schema.works.author,
    })
    .from(schema.works)
    .innerJoin(schema.passages, eq(schema.passages.workId, schema.works.id))
    .where(
      and(
        eq(schema.works.packId, input.packId),
        eq(schema.works.status, "ingested"),
        isNotNull(schema.passages.embedding),
      ),
    )
    .groupBy(schema.works.id, schema.works.title, schema.works.author)
    .orderBy(nearest)
    .limit(WORK_SHORTLIST);

  if (cards.length === 0 && works.length === 0) return null;
  return { cards, works };
}

/** §11 step 1 — the router decides what the answer needs. */
async function routeMessage(input: {
  packId: string;
  workspaceId: string;
  message: string;
  queryVec: number[] | null;
}): Promise<Array<{ type: "card" | "work"; id: string }>> {
  // Stage 1: embedding shortlist (scalable). Stage 2: the LLM picks from it.
  // Falls back to the full index only when embeddings are unavailable, so an
  // Ollama outage degrades to the old behaviour instead of routing to nothing.
  const shortlist = await shortlistCandidates({
    packId: input.packId,
    queryVec: input.queryVec,
  });
  const cards =
    shortlist?.cards ??
    (await db.query.conceptCards.findMany({
      where: eq(schema.conceptCards.packId, input.packId),
      columns: { id: true, title: true, authorScope: true },
    }));
  const works =
    shortlist?.works ??
    (await db.query.works.findMany({
      where: and(
        eq(schema.works.packId, input.packId),
        eq(schema.works.status, "ingested"),
      ),
      columns: { id: true, title: true, author: true },
    }));

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
  /** H5: set on the follow-up request after the user approves a large load. */
  approveLargeLoads?: boolean;
}): Promise<void> {
  const { workspaceId, message, emit, approveLargeLoads = false } = input;
  const workspace = await db.query.workspaces.findFirst({
    where: eq(schema.workspaces.id, workspaceId),
  });
  if (!workspace) {
    emit({ type: "error", message: "Unknown workspace." });
    return;
  }
  const pack = getPack(workspace.packId);
  const settings = resolveSettings(workspace.settings);

  // The turn clock is the count of user messages *including* this one. The
  // message isn't persisted until we clear the H5 interrupt gate (below), so
  // an interrupted-and-abandoned turn leaves no orphaned row.
  const priorTurns = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.messages)
    .where(
      and(
        eq(schema.messages.workspaceId, workspaceId),
        eq(schema.messages.role, "user"),
      ),
    );
  const currentTurn = Number(priorTurns[0]?.count ?? 0) + 1;

  // Embed the question once per turn and reuse the vector for both routing
  // (the candidate shortlist) and eviction (per-item relevance). Null when
  // Ollama is unavailable — both consumers degrade to their pre-embedding
  // behaviour rather than failing the turn.
  const queryVec = (await embed([message]))?.[0] ?? null;

  // 1. route
  emit({ type: "status", message: "Consulting the shelf…" });
  let picks: Array<{ type: "card" | "work"; id: string }> = [];
  try {
    picks = await routeMessage({ packId: workspace.packId, workspaceId, message, queryVec });
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

  const currentSet = await loadWorkingSet(workspaceId);

  // Tag each held item with its relevance to *this* question so eviction can
  // spare a stale-but-on-topic card. Recomputed every turn; skipped wholesale
  // when the query couldn't be embedded (relevance then stays neutral).
  if (queryVec) {
    const relevance = await relevanceForItems(queryVec, currentSet);
    for (const item of currentSet) {
      item.relevance = relevance.get(`${item.itemType}:${item.itemId}`) ?? 0;
    }
  }

  // H5 interrupt policy. Sum the tokens this turn would newly hydrate (items
  // not already hydrated). If that swing exceeds the threshold and the user
  // hasn't already approved, pause and ask — nothing is persisted or loaded.
  if (!approveLargeLoads && interruptsEnabled(settings)) {
    const hydratedKeys = new Set(
      currentSet
        .filter((i) => i.state === "hydrated")
        .map((i) => `${i.itemType}:${i.itemId}`),
    );
    const incoming = required.filter(
      (r) => !hydratedKeys.has(`${r.itemType}:${r.itemId}`),
    );
    const incomingTokens = incoming.reduce((sum, r) => sum + r.hydratedTokenCost, 0);
    if (incomingTokens > settings.askAboveTokens && incoming[0]) {
      emit({
        type: "interrupt",
        label: incoming[0].title,
        itemCount: incoming.length,
        incomingTokens,
      });
      return;
    }
  }

  await db.insert(schema.messages).values({
    workspaceId,
    role: "user",
    content: message,
  });

  await emitTimelineEvent(
    workspaceId,
    "router",
    required.length === 0
      ? "Looked over the shelf — nothing there covers this."
      : retrieved
        ? `Retrieved ${required.length} passage${required.length === 1 ? "" : "s"} — no concept card covered this.`
        : `Chose ${required.length} source${required.length === 1 ? "" : "s"} from the shelf, starting with *${required[0]?.title}*.`,
  );

  if (required[0]) {
    emit({
      type: "status",
      message: `Bringing *${required[0].title}* into memory…`,
    });
  }

  // 2. plan memory + persist + narrate
  const planned = plan({
    currentSet,
    required,
    budgetTokens: settings.tokenBudget,
    currentTurn,
    stalenessWeight: settings.stalenessWeight,
    relevanceWeight: settings.relevanceWeight,
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

  await emitTimelineEvent(
    workspaceId,
    "synthesis",
    `Answered with ${provenance.length} citation${provenance.length === 1 ? "" : "s"}.`,
  );

  emit({ type: "done", messageId, content: clean, provenance });
}
