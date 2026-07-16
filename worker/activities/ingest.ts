import { readFile } from "node:fs/promises";
import path from "node:path";
import { Context } from "@temporalio/activity";
import { trace } from "@opentelemetry/api";
import { and, asc, desc, eq, ilike, inArray, isNull, sql } from "drizzle-orm";
import { getPack } from "@/domain-packs";
import { chunkWork } from "@/lib/chunking";
import { db, schema } from "@/lib/db";
import { chat, embed, fillTemplate } from "@/lib/llm";

/**
 * Ingestion activities (§9). All idempotent: chunking upserts on
 * (work_id, ordinal), summaries upsert on passage_id, cards check
 * by title. Progress lands in `events` in domain language only —
 * the ingest screen renders these rows verbatim (§9.3).
 */

const CORPUS_ROOT = path.join(process.cwd(), "corpus");

interface ManifestWork {
  author: string;
  authorDisplay: string;
  title: string;
  translator: string;
  licenseNote: string;
  wordCount: number;
  file: string;
}

async function emitEvent(
  workspaceId: string,
  kind: string,
  domainMessage: string,
  payload?: unknown,
): Promise<void> {
  await db.insert(schema.events).values({
    workspaceId,
    kind,
    domainMessage,
    otelTraceId: trace.getActiveSpan()?.spanContext().traceId ?? null,
    payload: payload ?? null,
  });
}

/**
 * The H2 quiet "resumed" note: called once at worker boot, never from inside
 * an activity. Ordinary activity retries (an Ollama hiccup, a Groq 429) are
 * Temporal's own retry policy doing its job — the spec is explicit that
 * those must stay invisible. What the note is FOR is the case where the
 * whole worker process died (killed, laptop slept) and came back: on boot,
 * any work still sitting in a non-terminal status ("chunking",
 * "summarizing", "embedding") was left there by a previous process, since a
 * live worker would have driven it to "ingested". Find the newest workspace
 * for each such pack that hasn't finished ("pack_ready") and emit one note.
 */
export async function noteResumedWorkOnBoot(): Promise<void> {
  const stuck = await db
    .selectDistinct({ packId: schema.works.packId })
    .from(schema.works)
    .where(
      inArray(schema.works.status, ["chunking", "summarizing", "embedding"]),
    );

  for (const { packId } of stuck) {
    const workspace = await db.query.workspaces.findFirst({
      where: eq(schema.workspaces.packId, packId),
      orderBy: desc(schema.workspaces.createdAt),
    });
    if (!workspace) continue;

    const finished = await db.query.events.findFirst({
      where: and(
        eq(schema.events.workspaceId, workspace.id),
        eq(schema.events.kind, "pack_ready"),
      ),
    });
    if (finished) continue;

    await emitEvent(workspace.id, "resumed", "Resumed after an interruption.");
  }
}

/**
 * Upsert works rows from the pack's manifest. Packs own their manifest at
 * corpus/<packId>/manifest.json; corpus/manifest.json is the legacy location
 * used by the first (philosophy) pack's fetch script.
 */
export async function preparePack(input: {
  packId: string;
  workspaceId: string;
}): Promise<Array<{ workId: string; title: string; author: string }>> {
  const manifestPath = await (async () => {
    const perPack = path.join(CORPUS_ROOT, input.packId, "manifest.json");
    try {
      await readFile(perPack, "utf8");
      return perPack;
    } catch {
      return path.join(CORPUS_ROOT, "manifest.json");
    }
  })();
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    works: ManifestWork[];
  };

  const out: Array<{ workId: string; title: string; author: string }> = [];
  for (const w of manifest.works) {
    const rows = await db
      .insert(schema.works)
      .values({
        packId: input.packId,
        author: w.author,
        title: w.title,
        translator: w.translator,
        licenseNote: w.licenseNote,
        sourceFile: w.file,
        wordCount: w.wordCount,
      })
      .onConflictDoUpdate({
        target: [schema.works.packId, schema.works.author, schema.works.title],
        set: { sourceFile: w.file, wordCount: w.wordCount },
      })
      .returning({ id: schema.works.id });
    const row = rows[0];
    if (!row) throw new Error(`Upsert returned no row for ${w.title}`);
    out.push({ workId: row.id, title: w.title, author: w.author });
  }

  await emitEvent(
    input.workspaceId,
    "pack_opened",
    `Corpus opened — ${out.length} works on the shelf.`,
  );
  return out;
}

/** Chunk one work into passages (upsert by ordinal). */
export async function chunkWorkActivity(input: {
  workId: string;
  workspaceId: string;
  packId: string;
}): Promise<{ passageCount: number }> {
  const work = await db.query.works.findFirst({
    where: eq(schema.works.id, input.workId),
  });
  if (!work) throw new Error(`Unknown work ${input.workId}`);

  const pack = getPack(input.packId);
  const rules =
    pack.chunking.perAuthor?.[work.author] ?? pack.chunking.default;
  const source = await readFile(
    path.join(process.cwd(), work.sourceFile),
    "utf8",
  );
  const passages = chunkWork(source, rules);

  await db
    .update(schema.works)
    .set({ status: "chunking" })
    .where(eq(schema.works.id, input.workId));

  for (const p of passages) {
    Context.current().heartbeat(p.ordinal);
    await db
      .insert(schema.passages)
      .values({
        workId: input.workId,
        ordinal: p.ordinal,
        text: p.text,
        heading: p.heading,
        charStart: p.charStart,
        charEnd: p.charEnd,
        tokenCount: p.tokenCount,
      })
      .onConflictDoUpdate({
        target: [schema.passages.workId, schema.passages.ordinal],
        set: {
          text: p.text,
          heading: p.heading,
          charStart: p.charStart,
          charEnd: p.charEnd,
          tokenCount: p.tokenCount,
        },
      });
  }
  return { passageCount: passages.length };
}

/**
 * Summarize one batch of not-yet-summarized passages. The workflow loops
 * until `remaining` hits zero, so a crash resumes mid-work with no
 * duplicates.
 */
export async function summarizeBatch(input: {
  workId: string;
  workspaceId: string;
  packId: string;
  batchSize: number;
}): Promise<{ summarized: number; remaining: number }> {
  const pack = getPack(input.packId);
  const work = await db.query.works.findFirst({
    where: eq(schema.works.id, input.workId),
  });
  if (!work) throw new Error(`Unknown work ${input.workId}`);

  await db
    .update(schema.works)
    .set({ status: "summarizing" })
    .where(eq(schema.works.id, input.workId));

  const batch = await db
    .select({
      id: schema.passages.id,
      text: schema.passages.text,
      heading: schema.passages.heading,
    })
    .from(schema.passages)
    .leftJoin(
      schema.summaries,
      eq(schema.summaries.passageId, schema.passages.id),
    )
    .where(
      and(
        eq(schema.passages.workId, input.workId),
        isNull(schema.summaries.passageId),
      ),
    )
    .orderBy(asc(schema.passages.ordinal))
    .limit(input.batchSize);

  for (const passage of batch) {
    Context.current().heartbeat(passage.id);
    const result = await chat("summarize", {
      prompt: fillTemplate(pack.prompts.summarizePassage, {
        passage: passage.text,
        author: work.author,
        work: work.title,
      }),
      maxTokens: 200,
      workspaceId: input.workspaceId,
    });
    await db
      .insert(schema.summaries)
      .values({
        passageId: passage.id,
        text: result.text.trim(),
        model: result.model,
      })
      .onConflictDoNothing();
  }

  const remainingRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.passages)
    .leftJoin(
      schema.summaries,
      eq(schema.summaries.passageId, schema.passages.id),
    )
    .where(
      and(
        eq(schema.passages.workId, input.workId),
        isNull(schema.summaries.passageId),
      ),
    );
  return {
    summarized: batch.length,
    remaining: Number(remainingRows[0]?.count ?? 0),
  };
}

/**
 * Embed all passages of a work that lack embeddings. Skips gracefully when
 * Ollama isn't running — re-running the workflow backfills later.
 */
export async function embedWork(input: {
  workId: string;
  workspaceId: string;
}): Promise<{ embedded: number; deferred: boolean }> {
  await db
    .update(schema.works)
    .set({ status: "embedding" })
    .where(eq(schema.works.id, input.workId));

  let embedded = 0;
  for (;;) {
    const batch = await db
      .select({ id: schema.passages.id, text: schema.passages.text })
      .from(schema.passages)
      .where(
        and(
          eq(schema.passages.workId, input.workId),
          isNull(schema.passages.embedding),
        ),
      )
      .orderBy(asc(schema.passages.ordinal))
      .limit(16);
    if (batch.length === 0) break;

    Context.current().heartbeat(embedded);
    const vectors = await embed(batch.map((p) => p.text));
    if (vectors === null) {
      return { embedded, deferred: true };
    }
    for (let i = 0; i < batch.length; i++) {
      const passage = batch[i];
      const vector = vectors[i];
      if (!passage || !vector) continue;
      await db
        .update(schema.passages)
        .set({ embedding: vector })
        .where(eq(schema.passages.id, passage.id));
      embedded++;
    }
  }
  return { embedded, deferred: false };
}

/** Mark a work done and narrate the milestone (§9.3). */
export async function finishWork(input: {
  workId: string;
  workspaceId: string;
  workIndex: number;
  workTotal: number;
  embeddingsDeferred: boolean;
}): Promise<void> {
  const work = await db.query.works.findFirst({
    where: eq(schema.works.id, input.workId),
  });
  if (!work) throw new Error(`Unknown work ${input.workId}`);
  const counts = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.passages)
    .where(eq(schema.passages.workId, input.workId));

  await db
    .update(schema.works)
    .set({ status: "ingested" })
    .where(eq(schema.works.id, input.workId));

  await emitEvent(
    input.workspaceId,
    "work_finished",
    `Finished *${work.title}* — ${Number(counts[0]?.count ?? 0)} passages (${input.workIndex} of ${input.workTotal} works).`,
  );
  if (input.embeddingsDeferred) {
    await emitEvent(
      input.workspaceId,
      "embeddings_deferred",
      `Embeddings for *${work.title}* deferred — local embedding model unavailable.`,
    );
  }
}

/**
 * Synthesize concept cards from the pack's concept seeds: for each seed,
 * gather matching summaries across works and write one card.
 */
export async function synthesizeConceptCards(input: {
  packId: string;
  workspaceId: string;
}): Promise<{ cards: number }> {
  const pack = getPack(input.packId);
  const seeds = pack.conceptSeeds ?? [];
  let cards = 0;

  await emitEvent(
    input.workspaceId,
    "cards_started",
    "Reading across works — concept cards forming.",
  );

  for (const seed of seeds) {
    Context.current().heartbeat(seed);
    const title = seed;
    const existing = await db.query.conceptCards.findFirst({
      where: and(
        eq(schema.conceptCards.packId, input.packId),
        eq(schema.conceptCards.title, title),
      ),
    });
    if (existing) continue; // idempotent re-run

    const matches = await db
      .select({
        passageId: schema.summaries.passageId,
        summary: schema.summaries.text,
        author: schema.works.author,
        work: schema.works.title,
      })
      .from(schema.summaries)
      .innerJoin(
        schema.passages,
        eq(schema.passages.id, schema.summaries.passageId),
      )
      .innerJoin(schema.works, eq(schema.works.id, schema.passages.workId))
      .where(
        and(
          eq(schema.works.packId, input.packId),
          ilike(schema.summaries.text, `%${seed}%`),
        ),
      )
      .limit(40);
    if (matches.length < 8) continue; // not enough material for a card

    const summariesBlock = matches
      .map((m) => `- (${m.author}, ${m.work}) ${m.summary}`)
      .join("\n");
    const result = await chat("concept_card", {
      prompt: fillTemplate(pack.prompts.synthesizeCard, {
        concept: title,
        summaries: summariesBlock,
      }),
      maxTokens: 600,
      workspaceId: input.workspaceId,
    });

    const body = result.text.trim();
    // Embed the card in the same space as passages so the router can
    // cosine-shortlist it and eviction can score its relevance. Deferred
    // (null) when Ollama is down — scripts/embed-cards.ts backfills later,
    // exactly like passage embeddings.
    const cardVector = (await embed([`${title}\n\n${body}`]))?.[0] ?? null;
    const inserted = await db
      .insert(schema.conceptCards)
      .values({
        packId: input.packId,
        title,
        body,
        authorScope: [...new Set(matches.map((m) => m.author))],
        embedding: cardVector,
      })
      .returning({ id: schema.conceptCards.id });
    const card = inserted[0];
    if (!card) continue;
    for (const m of matches) {
      await db
        .insert(schema.cardPassages)
        .values({ cardId: card.id, passageId: m.passageId, weight: 1 })
        .onConflictDoNothing();
    }
    cards++;
    await emitEvent(
      input.workspaceId,
      "card_created",
      `New concept card: *${title}* — drawn from ${matches.length} passages.`,
    );
  }
  return { cards };
}

/** Generate the empty-state starter prompts and store them on the workspace. */
export async function generateStarterPrompts(input: {
  packId: string;
  workspaceId: string;
}): Promise<{ prompts: number }> {
  const pack = getPack(input.packId);
  const cards = await db.query.conceptCards.findMany({
    where: eq(schema.conceptCards.packId, input.packId),
  });
  const cardsBlock = cards
    .map((c) => `- ${c.title} [${c.authorScope.join(", ")}]: ${c.body.slice(0, 200)}`)
    .join("\n");

  const result = await chat("starter_prompts", {
    prompt: fillTemplate(pack.prompts.starterPromptGen, { cards: cardsBlock }),
    json: true,
    maxTokens: 900,
    workspaceId: input.workspaceId,
  });

  let prompts: Array<{ prompt: string; behavior: string }> = [];
  try {
    const parsed = JSON.parse(result.text) as unknown;
    const list = Array.isArray(parsed)
      ? parsed
      : ((parsed as Record<string, unknown>).prompts ??
        Object.values(parsed as Record<string, unknown>)[0]);
    if (Array.isArray(list)) {
      prompts = list
        .filter(
          (p): p is { prompt: string; behavior: string } =>
            typeof p === "object" &&
            p !== null &&
            typeof (p as Record<string, unknown>).prompt === "string",
        )
        .slice(0, 6);
    }
  } catch {
    // leave prompts empty; the workspace falls back to none rather than junk
  }

  await db
    .update(schema.workspaces)
    .set({ starterPrompts: prompts })
    .where(eq(schema.workspaces.id, input.workspaceId));

  await emitEvent(
    input.workspaceId,
    "pack_ready",
    "The shelf is ready — ask it something.",
  );
  return { prompts: prompts.length };
}
