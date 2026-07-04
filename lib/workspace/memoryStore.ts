import { asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { estimateTokens } from "@/lib/chunking";
import {
  currentTokenCost,
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
    })
    .from(schema.cardPassages)
    .innerJoin(
      schema.passages,
      eq(schema.passages.id, schema.cardPassages.passageId),
    )
    .innerJoin(schema.works, eq(schema.works.id, schema.passages.workId))
    .where(eq(schema.cardPassages.cardId, cardId))
    .orderBy(desc(schema.cardPassages.weight), asc(schema.passages.ordinal))
    .limit(CARD_HYDRATED_PASSAGE_CAP);
  return rows;
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

async function workSummaryContent(workId: string): Promise<ItemContent | null> {
  const work = await db.query.works.findFirst({
    where: eq(schema.works.id, workId),
  });
  if (!work) return null;
  const summaries = await workSummaries(workId);
  const tokens = summaries.reduce((sum, s) => sum + estimateTokens(s.text), 0);
  return {
    title: `About ${work.title}`,
    hydratedTokenCost: Math.max(tokens, 1),
    compressedTokenCost: Math.min(Math.max(tokens, 1), 60),
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

/** Write the planned set + ops back: upsert rows, append the audit log. */
export async function persistPlan(input: {
  workspaceId: string;
  nextSet: WorkingMemoryItem[];
  ops: MemoryOp[];
  actor: "agent" | "user";
}): Promise<void> {
  const { workspaceId, nextSet, ops, actor } = input;
  for (const item of nextSet) {
    await db
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
    await db.insert(schema.memoryOps).values({
      workspaceId,
      op: op.op,
      itemType: op.itemType,
      itemId: op.itemId,
      actor,
      reason: op.reason,
    });
  }
}
