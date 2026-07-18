import { and, asc, cosineDistance, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { estimateTokens } from "@/lib/chunking";
import { chooseDiverseCardMatches } from "@/lib/conceptCards";
import {
  currentTokenCost,
  itemKey,
  type ItemType,
  type MemoryOp,
  type RequiredItem,
  type WorkingMemoryItem,
} from "@/lib/memory";

/**
 * Persistence adapter between lib/memory's pure items and the
 * working_memory_items / memory_ops tables. Token costs are recomputed from
 * content on load rather than trusted from the row, so a card whose body
 * changed re-costs correctly; `last_touched_turn` carries the pure module's
 * monotonic clock.
 */

const CARD_HYDRATED_PASSAGE_CAP = 8;

interface ItemContent {
  title: string;
  hydratedTokenCost: number;
  compressedTokenCost: number;
}

/** The exact compact representation used for a compressed work in a prompt. */
export function renderCompressedWorkSummary(input: {
  title: string;
  orientationSummary: string | null;
}): string {
  return [
    `## About ${input.title}`,
    input.orientationSummary ??
      "Orientation unavailable — hydrate this work to inspect its section summaries.",
  ].join("\n");
}

export function renderWorkSummary(input: {
  title: string;
  orientationSummary: string | null;
  state: string;
  summaries: Array<{ passageId: string; ordinal: number; text: string }>;
}): string {
  if (input.state === "compressed") {
    return renderCompressedWorkSummary(input);
  }
  const lines = input.summaries.map((s) => `[p:${s.passageId}] §${s.ordinal}: ${s.text}`);
  return [`## About ${input.title}`, ...lines].join("\n");
}

async function cardContent(cardId: string): Promise<ItemContent | null> {
  const card = await db.query.conceptCards.findFirst({
    where: eq(schema.conceptCards.id, cardId),
  });
  if (!card) return null;
  const passages = await cardPassagesFor(cardId);
  const bodyTokens = estimateTokens(card.body);
  const passageTokens = passages.reduce(
    (sum, p) => sum + estimateTokens(p.text),
    0,
  );
  return {
    title: card.title,
    hydratedTokenCost: bodyTokens + passageTokens,
    compressedTokenCost: bodyTokens,
  };
}

export async function cardPassagesFor(cardId: string) {
  const rows = await db
    .select({
      id: schema.passages.id,
      text: schema.passages.text,
      ordinal: schema.passages.ordinal,
      author: schema.works.author,
      workTitle: schema.works.title,
      weight: schema.cardPassages.weight,
      evidenceRole: schema.cardPassages.evidenceRole,
    })
    .from(schema.cardPassages)
    .innerJoin(
      schema.passages,
      eq(schema.passages.id, schema.cardPassages.passageId),
    )
    .innerJoin(schema.works, eq(schema.works.id, schema.passages.workId))
    .where(eq(schema.cardPassages.cardId, cardId))
    .orderBy(desc(schema.cardPassages.weight), asc(schema.passages.ordinal))
    .limit(32);
  // Card links are ordered by strength, then diversified across works so a
  // multi-work card does not spend its entire evidence budget on one source.
  return chooseDiverseCardMatches(
    rows.map((row) => ({
      passageId: row.id,
      summary: row.text,
      author: row.author,
      work: row.workTitle,
      weight: row.weight,
    })),
    CARD_HYDRATED_PASSAGE_CAP,
  ).map((selected) => {
    const original = rows.find((row) => row.id === selected.passageId)!;
    return original;
  });
}

async function passageContent(passageId: string): Promise<ItemContent | null> {
  const row = await db
    .select({
      text: schema.passages.text,
      ordinal: schema.passages.ordinal,
      workTitle: schema.works.title,
    })
    .from(schema.passages)
    .innerJoin(schema.works, eq(schema.works.id, schema.passages.workId))
    .where(eq(schema.passages.id, passageId))
    .limit(1);
  const p = row[0];
  if (!p) return null;
  const tokens = estimateTokens(p.text);
  return {
    title: `${p.workTitle} §${p.ordinal}`,
    hydratedTokenCost: tokens,
    compressedTokenCost: Math.min(tokens, 40), // a passage compresses to a stub line
  };
}

/** Work summaries render as the work's passage summaries (capped). */
const WORK_SUMMARY_CAP = 40;

export async function workSummaries(workId: string) {
  return await db
    .select({
      passageId: schema.summaries.passageId,
      text: schema.summaries.text,
      ordinal: schema.passages.ordinal,
    })
    .from(schema.summaries)
    .innerJoin(
      schema.passages,
      eq(schema.passages.id, schema.summaries.passageId),
    )
    .where(eq(schema.passages.workId, workId))
    .orderBy(asc(schema.passages.ordinal))
    .limit(WORK_SUMMARY_CAP);
}

/**
 * Exact passage ids that a hydrated working set contributes to synthesis.
 * Compressed items deliberately contribute no primary evidence: their card
 * bodies/orientation notes help the model navigate, but cannot justify a
 * provenance chip.
 */
export async function contextPassageIdsForItems(
  items: Array<Pick<WorkingMemoryItem, "itemType" | "itemId" | "state">>,
): Promise<string[]> {
  const ids = new Set<string>();
  for (const item of items) {
    if (item.state !== "hydrated") continue;
    if (item.itemType === "card") {
      for (const passage of await cardPassagesFor(item.itemId)) ids.add(passage.id);
    } else if (item.itemType === "passage") {
      ids.add(item.itemId);
    } else {
      for (const summary of await workSummaries(item.itemId)) ids.add(summary.passageId);
    }
  }
  return [...ids];
}

async function workSummaryContent(workId: string): Promise<ItemContent | null> {
  const work = await db.query.works.findFirst({
    where: eq(schema.works.id, workId),
  });
  if (!work) return null;
  const summaries = await workSummaries(workId);
  const hydratedTokenCost = estimateTokens(
    renderWorkSummary({
      title: work.title,
      orientationSummary: work.orientationSummary,
      state: "hydrated",
      summaries,
    }),
  );
  return {
    title: `About ${work.title}`,
    hydratedTokenCost,
    compressedTokenCost: estimateTokens(
      renderCompressedWorkSummary({
        title: work.title,
        orientationSummary: work.orientationSummary,
      }),
    ),
  };
}

export async function itemContent(
  itemType: ItemType,
  itemId: string,
): Promise<ItemContent | null> {
  switch (itemType) {
    case "card":
      return cardContent(itemId);
    case "passage":
      return passageContent(itemId);
    case "work_summary":
      return workSummaryContent(itemId);
  }
}

export async function buildRequiredItem(
  itemType: ItemType,
  itemId: string,
  weight = 1,
): Promise<RequiredItem | null> {
  const content = await itemContent(itemType, itemId);
  if (!content) return null;
  return { itemType, itemId, weight, ...content };
}

export async function loadWorkingSet(
  workspaceId: string,
): Promise<WorkingMemoryItem[]> {
  const rows = await db.query.workingMemoryItems.findMany({
    where: eq(schema.workingMemoryItems.workspaceId, workspaceId),
  });
  const items: WorkingMemoryItem[] = [];
  for (const row of rows) {
    const content = await itemContent(row.itemType, row.itemId);
    if (!content) continue; // referenced item no longer exists
    items.push({
      itemType: row.itemType,
      itemId: row.itemId,
      state: row.state,
      pinned: row.pinned,
      lastTouchedAtTurn: row.lastTouchedTurn,
      weight: 1,
      ...content,
    });
  }
  return items;
}

/**
 * Cosine relevance of a query vector to each working-set item, keyed by
 * itemKey (0..1, higher = more on-topic). Cards and passages use their own
 * embedding; a work_summary uses its single nearest passage (mirroring the
 * router's work ranking). Items whose embedding is missing are simply absent
 * from the map — the planner treats absent as neutral (0). One query per item
 * type; working sets are small so this stays cheap.
 */
export async function relevanceForItems(
  queryVec: number[],
  items: Array<{ itemType: ItemType; itemId: string }>,
): Promise<Map<string, number>> {
  const rel = new Map<string, number>();
  const idsOf = (t: ItemType) =>
    items.filter((i) => i.itemType === t).map((i) => i.itemId);

  const cardIds = idsOf("card");
  if (cardIds.length > 0) {
    const rows = await db
      .select({
        id: schema.conceptCards.id,
        sim: sql<number>`1 - (${cosineDistance(schema.conceptCards.embedding, queryVec)})`,
      })
      .from(schema.conceptCards)
      .where(
        and(
          inArray(schema.conceptCards.id, cardIds),
          isNotNull(schema.conceptCards.embedding),
        ),
      );
    for (const r of rows) {
      rel.set(itemKey({ itemType: "card", itemId: r.id }), Math.max(0, Number(r.sim)));
    }
  }

  const passageIds = idsOf("passage");
  if (passageIds.length > 0) {
    const rows = await db
      .select({
        id: schema.passages.id,
        sim: sql<number>`1 - (${cosineDistance(schema.passages.embedding, queryVec)})`,
      })
      .from(schema.passages)
      .where(
        and(
          inArray(schema.passages.id, passageIds),
          isNotNull(schema.passages.embedding),
        ),
      );
    for (const r of rows) {
      rel.set(itemKey({ itemType: "passage", itemId: r.id }), Math.max(0, Number(r.sim)));
    }
  }

  const workIds = idsOf("work_summary");
  if (workIds.length > 0) {
    const nearest = sql<number>`1 - min(${cosineDistance(schema.passages.embedding, queryVec)})`;
    const rows = await db
      .select({ id: schema.works.id, sim: nearest })
      .from(schema.works)
      .innerJoin(schema.passages, eq(schema.passages.workId, schema.works.id))
      .where(
        and(
          inArray(schema.works.id, workIds),
          isNotNull(schema.passages.embedding),
        ),
      )
      .groupBy(schema.works.id);
    for (const r of rows) {
      rel.set(
        itemKey({ itemType: "work_summary", itemId: r.id }),
        Math.max(0, Number(r.sim)),
      );
    }
  }

  return rel;
}

/** Write the planned set + ops back: upsert rows, append the audit log. */
export async function persistPlan(input: {
  workspaceId: string;
  /** Revision observed while reading the working set. */
  expectedMemoryRevision: number;
  nextSet: WorkingMemoryItem[];
  ops: MemoryOp[];
  actor: "agent" | "user";
}): Promise<void> {
  const { workspaceId, expectedMemoryRevision, nextSet, ops, actor } = input;
  await db.transaction(async (tx) => {
    // Claim the next revision before writing any memory rows. If another turn
    // committed after this plan was read, abort the whole transaction rather
    // than letting stale evictions overwrite its newer working set.
    const claimed = await tx
      .update(schema.workspaces)
      .set({ memoryRevision: expectedMemoryRevision + 1 })
      .where(
        and(
          eq(schema.workspaces.id, workspaceId),
          eq(schema.workspaces.memoryRevision, expectedMemoryRevision),
        ),
      )
      .returning({ id: schema.workspaces.id });
    if (!claimed[0]) throw new WorkingMemoryConflictError();
    for (const item of nextSet) {
      await tx
        .insert(schema.workingMemoryItems)
        .values({
          workspaceId,
          itemType: item.itemType,
          itemId: item.itemId,
          state: item.state,
          pinned: item.pinned,
          lastTouchedTurn: item.lastTouchedAtTurn,
          tokenCost: currentTokenCost(item),
        })
        .onConflictDoUpdate({
          target: [
            schema.workingMemoryItems.workspaceId,
            schema.workingMemoryItems.itemType,
            schema.workingMemoryItems.itemId,
          ],
          set: {
            state: item.state,
            pinned: item.pinned,
            lastTouchedTurn: item.lastTouchedAtTurn,
            lastTouchedAt: new Date(),
            tokenCost: currentTokenCost(item),
          },
        });
    }
    for (const op of ops) {
      await tx.insert(schema.memoryOps).values({
        workspaceId,
        op: op.op,
        itemType: op.itemType,
        itemId: op.itemId,
        actor,
        reason: op.reason,
      });
    }
  });
}

/** The caller must reload/replan rather than committing a stale working set. */
export class WorkingMemoryConflictError extends Error {
  constructor() {
    super("Working memory changed while this turn was being planned. Retry the request.");
  }
}
