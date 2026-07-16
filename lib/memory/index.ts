import {
  currentTokenCost,
  itemKey,
  type ItemType,
  type MemoryOp,
  type PlanResult,
  type RequiredItem,
  type WorkingMemoryItem,
} from "./types";

export * from "./types";

/**
 * The working-memory manager (§10.2). Pure, unit-tested, no LLM or DB calls.
 * Given the current working set and what the next answer requires, computes
 * the cheapest set of evictions: never pinned, prefer stale + unpinned +
 * low-weight, compress rather than drop (the card/summary stays behind as
 * `state: "compressed"` — raw passages leave, nothing is deleted).
 */

function pluralTurns(n: number): string {
  return `${n} turn${n === 1 ? "" : "s"}`;
}

function compressReason(
  item: WorkingMemoryItem,
  currentTurn: number,
  incomingLabel?: string,
): string {
  const staleness = pluralTurns(Math.max(0, currentTurn - item.lastTouchedAtTurn));
  const room = incomingLabel ? ` — needed room for *${incomingLabel}*` : "";
  return `Compressed *${item.title}* — untouched for ${staleness}${room}.`;
}

export const DEFAULT_STALENESS_WEIGHT = 1;
export const DEFAULT_RELEVANCE_WEIGHT = 1;

/**
 * Eviction score: higher = compress sooner. Blends three axes (the
 * Generative-Agents retrieval score, inverted for eviction):
 *   staleness × stalenessWeight  − importance  − relevance × relevanceWeight
 * Staleness (turns since touched) pushes an item out; importance (weight) and
 * relevance (cosine to the current query, 0..1) hold it in. At stalenessWeight
 * 1 recency and importance balance; relevanceWeight then decides how much a
 * stale item's on-topic-ness earns it a reprieve. relevanceWeight 0 recovers
 * the pure staleness-vs-importance behaviour. These are the H3 knobs.
 */
function evictionScore(
  item: WorkingMemoryItem,
  currentTurn: number,
  stalenessWeight: number,
  relevanceWeight: number,
): number {
  const staleness = Math.max(0, currentTurn - item.lastTouchedAtTurn);
  return (
    staleness * stalenessWeight -
    item.weight -
    (item.relevance ?? 0) * relevanceWeight
  );
}

/**
 * Compress unpinned hydrated items, most-evictable first (see evictionScore),
 * until the set fits the budget or no more candidates remain. `protectedKeys`
 * (this turn's required items) are never picked, so a plan never evicts the
 * very thing it just loaded.
 */
function evictToFit(input: {
  set: WorkingMemoryItem[];
  budgetTokens: number;
  currentTurn: number;
  protectedKeys: Set<string>;
  stalenessWeight: number;
  relevanceWeight: number;
  incomingLabel?: string;
}): { nextSet: WorkingMemoryItem[]; ops: MemoryOp[]; usedTokens: number; overBudget: boolean } {
  const {
    set,
    budgetTokens,
    currentTurn,
    protectedKeys,
    stalenessWeight,
    relevanceWeight,
    incomingLabel,
  } = input;
  const nextSet = set.map((item) => ({ ...item }));
  const ops: MemoryOp[] = [];

  let usedTokens = nextSet.reduce((sum, item) => sum + currentTokenCost(item), 0);

  const candidates = nextSet
    .filter(
      (item) =>
        !item.pinned && item.state === "hydrated" && !protectedKeys.has(itemKey(item)),
    )
    .sort(
      (a, b) =>
        evictionScore(b, currentTurn, stalenessWeight, relevanceWeight) -
          evictionScore(a, currentTurn, stalenessWeight, relevanceWeight) ||
        a.itemId.localeCompare(b.itemId),
    );

  for (const candidate of candidates) {
    if (usedTokens <= budgetTokens) break;
    const freed = candidate.hydratedTokenCost - candidate.compressedTokenCost;
    candidate.state = "compressed";
    usedTokens -= freed;
    ops.push({
      op: "evict",
      itemType: candidate.itemType,
      itemId: candidate.itemId,
      reason: compressReason(candidate, currentTurn, incomingLabel),
    });
  }

  return { nextSet, ops, usedTokens, overBudget: usedTokens > budgetTokens };
}

export function plan(input: {
  currentSet: WorkingMemoryItem[];
  required: RequiredItem[];
  budgetTokens: number;
  currentTurn: number;
  stalenessWeight?: number;
  relevanceWeight?: number;
}): PlanResult {
  const {
    currentSet,
    required,
    budgetTokens,
    currentTurn,
    stalenessWeight = DEFAULT_STALENESS_WEIGHT,
    relevanceWeight = DEFAULT_RELEVANCE_WEIGHT,
  } = input;
  const working = currentSet.map((item) => ({ ...item }));
  const byKey = new Map(working.map((item) => [itemKey(item), item]));
  const loads: RequiredItem[] = [];
  const hydrateOps: MemoryOp[] = [];

  for (const req of required) {
    const key = itemKey(req);
    const existing = byKey.get(key);
    if (!existing) {
      const fresh: WorkingMemoryItem = {
        itemType: req.itemType,
        itemId: req.itemId,
        title: req.title,
        state: "hydrated",
        pinned: false,
        lastTouchedAtTurn: currentTurn,
        weight: req.weight ?? 1,
        hydratedTokenCost: req.hydratedTokenCost,
        compressedTokenCost: req.compressedTokenCost,
      };
      working.push(fresh);
      byKey.set(key, fresh);
      loads.push(req);
      hydrateOps.push({
        op: "hydrate",
        itemType: req.itemType,
        itemId: req.itemId,
        reason: `Hydrated *${req.title}*.`,
      });
    } else {
      if (existing.state !== "hydrated") {
        loads.push(req);
        hydrateOps.push({
          op: "hydrate",
          itemType: req.itemType,
          itemId: req.itemId,
          reason: `Hydrated *${req.title}*.`,
        });
      }
      existing.state = "hydrated";
      existing.lastTouchedAtTurn = currentTurn;
    }
  }

  const protectedKeys = new Set(required.map((r) => itemKey(r)));
  const { nextSet, ops, usedTokens, overBudget } = evictToFit({
    set: working,
    budgetTokens,
    currentTurn,
    protectedKeys,
    stalenessWeight,
    relevanceWeight,
    incomingLabel: required[0]?.title,
  });

  return { nextSet, loads, ops: [...hydrateOps, ...ops], usedTokens, overBudget };
}

/** User pins an item — inviolable to agent eviction from this point on. */
export function pin(
  set: WorkingMemoryItem[],
  target: { itemType: ItemType; itemId: string },
): { nextSet: WorkingMemoryItem[]; op: MemoryOp | null } {
  const key = itemKey(target);
  const nextSet = set.map((item) => ({ ...item }));
  const item = nextSet.find((i) => itemKey(i) === key);
  if (!item || item.pinned) return { nextSet, op: null };
  item.pinned = true;
  return {
    nextSet,
    op: { op: "pin", ...target, reason: `You pinned *${item.title}*.` },
  };
}

export function unpin(
  set: WorkingMemoryItem[],
  target: { itemType: ItemType; itemId: string },
): { nextSet: WorkingMemoryItem[]; op: MemoryOp | null } {
  const key = itemKey(target);
  const nextSet = set.map((item) => ({ ...item }));
  const item = nextSet.find((i) => itemKey(i) === key);
  if (!item || !item.pinned) return { nextSet, op: null };
  item.pinned = false;
  return {
    nextSet,
    op: { op: "unpin", ...target, reason: `You unpinned *${item.title}*.` },
  };
}

/** User manually compresses an item. Pinned items are immovable — no-op. */
export function manualEvict(
  set: WorkingMemoryItem[],
  target: { itemType: ItemType; itemId: string },
): { nextSet: WorkingMemoryItem[]; op: MemoryOp | null } {
  const key = itemKey(target);
  const nextSet = set.map((item) => ({ ...item }));
  const item = nextSet.find((i) => itemKey(i) === key);
  if (!item || item.pinned || item.state === "compressed") {
    return { nextSet, op: null };
  }
  item.state = "compressed";
  return {
    nextSet,
    op: { op: "evict", ...target, reason: `You compressed *${item.title}*.` },
  };
}

/**
 * User manually hydrates an item, compressing other stale unpinned items to
 * make room if needed (never the item itself, never pins).
 */
export function manualHydrate(input: {
  currentSet: WorkingMemoryItem[];
  target: RequiredItem;
  budgetTokens: number;
  currentTurn: number;
  stalenessWeight?: number;
  relevanceWeight?: number;
}): { nextSet: WorkingMemoryItem[]; ops: MemoryOp[]; usedTokens: number; overBudget: boolean } {
  const {
    currentSet,
    target,
    budgetTokens,
    currentTurn,
    stalenessWeight = DEFAULT_STALENESS_WEIGHT,
    relevanceWeight = DEFAULT_RELEVANCE_WEIGHT,
  } = input;
  const key = itemKey(target);
  const working = currentSet.map((item) => ({ ...item }));
  const existing = working.find((i) => itemKey(i) === key);
  const hydrateOp: MemoryOp = {
    op: "hydrate",
    itemType: target.itemType,
    itemId: target.itemId,
    reason: `You brought *${target.title}* into memory.`,
  };

  if (existing) {
    existing.state = "hydrated";
    existing.lastTouchedAtTurn = currentTurn;
  } else {
    working.push({
      itemType: target.itemType,
      itemId: target.itemId,
      title: target.title,
      state: "hydrated",
      pinned: false,
      lastTouchedAtTurn: currentTurn,
      weight: target.weight ?? 1,
      hydratedTokenCost: target.hydratedTokenCost,
      compressedTokenCost: target.compressedTokenCost,
    });
  }

  const { nextSet, ops, usedTokens, overBudget } = evictToFit({
    set: working,
    budgetTokens,
    currentTurn,
    protectedKeys: new Set([key]),
    stalenessWeight,
    relevanceWeight,
    incomingLabel: target.title,
  });

  return { nextSet, ops: [hydrateOp, ...ops], usedTokens, overBudget };
}

/**
 * Deterministic context ordering (§10.2): pinned first, then by recency —
 * stable across identical input so Anthropic/Groq prompt caching gets a
 * long stable prefix. Ties broken by itemId for full determinism.
 */
export function orderForContext(set: WorkingMemoryItem[]): WorkingMemoryItem[] {
  return [...set].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.lastTouchedAtTurn !== b.lastTouchedAtTurn) {
      return b.lastTouchedAtTurn - a.lastTouchedAtTurn;
    }
    return a.itemId.localeCompare(b.itemId);
  });
}
