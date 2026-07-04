export type ItemType = "card" | "passage" | "work_summary";
export type ItemState = "hydrated" | "compressed";

/**
 * An item in the working set. Time is modeled as a monotonic turn counter
 * rather than a wall-clock timestamp — the persistence layer (P6) maps this
 * to `last_touched_at`, but keeping the pure module clock-free makes staleness
 * ordering and reason text deterministic and easy to unit test.
 */
export interface WorkingMemoryItem {
  itemType: ItemType;
  itemId: string;
  title: string; // human-readable label, used only in op reasons
  state: ItemState;
  pinned: boolean;
  lastTouchedAtTurn: number;
  weight: number; // relevance/importance; lower evicts first on a staleness tie
  hydratedTokenCost: number; // footprint while state === "hydrated"
  compressedTokenCost: number; // footprint while state === "compressed"
}

export function itemKey(item: Pick<WorkingMemoryItem, "itemType" | "itemId">): string {
  return `${item.itemType}:${item.itemId}`;
}

export function currentTokenCost(item: WorkingMemoryItem): number {
  return item.state === "hydrated" ? item.hydratedTokenCost : item.compressedTokenCost;
}

/**
 * What the next answer needs — the router's output (§11 step 1). Both token
 * costs are supplied by the caller (it knows the real card-body length and
 * the real passage length from the DB); this module never guesses a
 * compression ratio.
 */
export interface RequiredItem {
  itemType: ItemType;
  itemId: string;
  title: string;
  hydratedTokenCost: number;
  compressedTokenCost: number;
  weight?: number;
}

export type MemoryOpKind = "hydrate" | "evict" | "pin" | "unpin";

export interface MemoryOp {
  op: MemoryOpKind;
  itemType: ItemType;
  itemId: string;
  reason: string;
}

export interface PlanResult {
  nextSet: WorkingMemoryItem[];
  loads: RequiredItem[];
  ops: MemoryOp[];
  usedTokens: number;
  overBudget: boolean;
}
