import { describe, expect, it } from "vitest";
import {
  manualEvict,
  manualHydrate,
  orderForContext,
  pin,
  plan,
  unpin,
  type RequiredItem,
  type WorkingMemoryItem,
} from "./index";

function item(overrides: Partial<WorkingMemoryItem> = {}): WorkingMemoryItem {
  return {
    itemType: "card",
    itemId: "card-1",
    title: "Card One",
    state: "hydrated",
    pinned: false,
    lastTouchedAtTurn: 0,
    weight: 1,
    hydratedTokenCost: 1000,
    compressedTokenCost: 100,
    ...overrides,
  };
}

function required(overrides: Partial<RequiredItem> = {}): RequiredItem {
  return {
    itemType: "card",
    itemId: "new-card",
    title: "New Card",
    hydratedTokenCost: 1000,
    compressedTokenCost: 100,
    ...overrides,
  };
}

describe("plan — under budget", () => {
  it("loads new items with no evictions when there's room", () => {
    const result = plan({
      currentSet: [],
      required: [required()],
      budgetTokens: 10_000,
      currentTurn: 1,
    });
    expect(result.loads).toHaveLength(1);
    expect(result.ops.filter((o) => o.op === "evict")).toHaveLength(0);
    expect(result.overBudget).toBe(false);
    expect(result.nextSet).toHaveLength(1);
    expect(result.nextSet[0]?.state).toBe("hydrated");
  });

  it("does not re-load an already-hydrated required item", () => {
    const current = [item({ itemId: "new-card", lastTouchedAtTurn: 0 })];
    const result = plan({
      currentSet: current,
      required: [required()],
      budgetTokens: 10_000,
      currentTurn: 5,
    });
    expect(result.loads).toHaveLength(0);
    expect(result.nextSet[0]?.lastTouchedAtTurn).toBe(5); // touched anyway
  });
});

describe("plan — eviction ordering", () => {
  it("evicts the stalest unpinned item first", () => {
    const current = [
      item({ itemId: "stale", title: "Stale Card", lastTouchedAtTurn: 1 }),
      item({ itemId: "fresh", title: "Fresh Card", lastTouchedAtTurn: 9 }),
    ];
    // budget only fits one hydrated card (1000) plus the new load (1000) = 2000
    const result = plan({
      currentSet: current,
      required: [required({ itemId: "third", title: "Third Card" })],
      budgetTokens: 2100,
      currentTurn: 10,
    });
    const evicted = result.ops.filter((o) => o.op === "evict");
    expect(evicted).toHaveLength(1);
    expect(evicted[0]?.itemId).toBe("stale");
    const staleAfter = result.nextSet.find((i) => i.itemId === "stale");
    expect(staleAfter?.state).toBe("compressed");
    const freshAfter = result.nextSet.find((i) => i.itemId === "fresh");
    expect(freshAfter?.state).toBe("hydrated");
  });

  it("breaks a staleness tie on lowest weight first", () => {
    const current = [
      item({ itemId: "low-weight", title: "Low Weight", lastTouchedAtTurn: 2, weight: 1 }),
      item({ itemId: "high-weight", title: "High Weight", lastTouchedAtTurn: 2, weight: 5 }),
    ];
    const result = plan({
      currentSet: current,
      required: [required({ itemId: "third" })],
      budgetTokens: 2100,
      currentTurn: 10,
    });
    const evicted = result.ops.filter((o) => o.op === "evict");
    expect(evicted[0]?.itemId).toBe("low-weight");
  });

  it("compresses rather than drops — the item stays in the set", () => {
    const current = [item({ itemId: "stale", lastTouchedAtTurn: 1 })];
    const result = plan({
      currentSet: current,
      required: [required({ hydratedTokenCost: 5000, compressedTokenCost: 500 })],
      budgetTokens: 600,
      currentTurn: 5,
    });
    expect(result.nextSet.find((i) => i.itemId === "stale")).toBeDefined();
  });

  it("writes a human-readable reason naming what needed the room", () => {
    const current = [item({ itemId: "stale", title: "Hegel: the dialectic", lastTouchedAtTurn: 1 })];
    const result = plan({
      currentSet: current,
      required: [required({ title: "The Republic" })],
      budgetTokens: 1100,
      currentTurn: 13,
    });
    const evictReason = result.ops.find((o) => o.op === "evict")?.reason;
    expect(evictReason).toContain("Hegel: the dialectic");
    expect(evictReason).toContain("12 turns");
    expect(evictReason).toContain("The Republic");
  });
});

describe("plan — pin inviolability", () => {
  it("never evicts a pinned item, even over budget", () => {
    const current = [
      item({ itemId: "pinned", title: "Pinned Card", pinned: true, lastTouchedAtTurn: 0 }),
    ];
    const result = plan({
      currentSet: current,
      required: [required({ itemId: "big", hydratedTokenCost: 50_000, compressedTokenCost: 5000 })],
      budgetTokens: 1500,
      currentTurn: 20,
    });
    const pinnedAfter = result.nextSet.find((i) => i.itemId === "pinned");
    expect(pinnedAfter?.state).toBe("hydrated");
    expect(result.ops.some((o) => o.itemId === "pinned")).toBe(false);
    expect(result.overBudget).toBe(true);
  });

  it("manualEvict refuses to compress a pinned item", () => {
    const current = [item({ itemId: "pinned", pinned: true })];
    const result = manualEvict(current, { itemType: "card", itemId: "pinned" });
    expect(result.op).toBeNull();
    expect(result.nextSet[0]?.state).toBe("hydrated");
  });
});

describe("plan — budget overflow", () => {
  it("flags overBudget when no eviction candidates can make enough room", () => {
    const current = [item({ itemId: "only-pinned", pinned: true })];
    const result = plan({
      currentSet: current,
      required: [required({ hydratedTokenCost: 100_000, compressedTokenCost: 10_000 })],
      budgetTokens: 1000,
      currentTurn: 1,
    });
    expect(result.overBudget).toBe(true);
  });

  it("stops evicting as soon as the budget is satisfied", () => {
    const current = [
      item({ itemId: "a", lastTouchedAtTurn: 1 }),
      item({ itemId: "b", lastTouchedAtTurn: 2 }),
      item({ itemId: "c", lastTouchedAtTurn: 3 }),
    ];
    const result = plan({
      currentSet: current,
      required: [],
      // 3 items @ 1000 = 3000 used; one compress frees 900 → exactly 2100
      budgetTokens: 2100,
      currentTurn: 5,
    });
    const evicted = result.ops.filter((o) => o.op === "evict");
    expect(evicted).toHaveLength(1);
    expect(result.overBudget).toBe(false);
  });
});

describe("pin / unpin", () => {
  it("pin marks an item pinned and is idempotent (no duplicate op)", () => {
    const current = [item({ itemId: "x" })];
    const first = pin(current, { itemType: "card", itemId: "x" });
    expect(first.nextSet[0]?.pinned).toBe(true);
    expect(first.op?.op).toBe("pin");

    const second = pin(first.nextSet, { itemType: "card", itemId: "x" });
    expect(second.op).toBeNull();
  });

  it("unpin reverses it", () => {
    const current = [item({ itemId: "x", pinned: true })];
    const result = unpin(current, { itemType: "card", itemId: "x" });
    expect(result.nextSet[0]?.pinned).toBe(false);
    expect(result.op?.op).toBe("unpin");
  });
});

describe("manualHydrate", () => {
  it("hydrates the target and evicts stale unpinned items to fit", () => {
    const current = [
      item({ itemId: "stale", title: "Stale", state: "hydrated", lastTouchedAtTurn: 0 }),
    ];
    const result = manualHydrate({
      currentSet: current,
      target: required({ itemId: "wanted", title: "Wanted Card" }),
      budgetTokens: 1100,
      currentTurn: 4,
    });
    const wanted = result.nextSet.find((i) => i.itemId === "wanted");
    expect(wanted?.state).toBe("hydrated");
    expect(result.ops.some((o) => o.op === "hydrate" && o.itemId === "wanted")).toBe(true);
    expect(result.ops.some((o) => o.op === "evict" && o.itemId === "stale")).toBe(true);
  });

  it("never evicts the item being hydrated itself", () => {
    const current = [
      item({
        itemId: "already-here",
        state: "compressed",
        lastTouchedAtTurn: 0,
        hydratedTokenCost: 900,
        compressedTokenCost: 100,
      }),
    ];
    const result = manualHydrate({
      currentSet: current,
      target: required({
        itemId: "already-here",
        title: "Already Here",
        hydratedTokenCost: 900,
        compressedTokenCost: 100,
      }),
      budgetTokens: 100, // too small even for this one item, but it must stay hydrated
      currentTurn: 1,
    });
    const rehydrated = result.nextSet.find((i) => i.itemId === "already-here");
    expect(rehydrated?.state).toBe("hydrated");
    expect(result.overBudget).toBe(true);
  });
});

describe("orderForContext", () => {
  it("orders pinned items first, then by recency, deterministically", () => {
    const set = [
      item({ itemId: "old", pinned: false, lastTouchedAtTurn: 1 }),
      item({ itemId: "pinned-old", pinned: true, lastTouchedAtTurn: 0 }),
      item({ itemId: "new", pinned: false, lastTouchedAtTurn: 3 }),
      item({ itemId: "pinned-new", pinned: true, lastTouchedAtTurn: 2 }),
    ];
    const ordered = orderForContext(set).map((i) => i.itemId);
    expect(ordered).toEqual(["pinned-new", "pinned-old", "new", "old"]);
  });

  it("is stable across repeated calls on identical input (cache-friendly)", () => {
    const set = [
      item({ itemId: "b", lastTouchedAtTurn: 1 }),
      item({ itemId: "a", lastTouchedAtTurn: 1 }),
    ];
    const first = orderForContext(set).map((i) => i.itemId);
    const second = orderForContext(set).map((i) => i.itemId);
    expect(first).toEqual(second);
    expect(first).toEqual(["a", "b"]); // tie broken by itemId
  });
});
