/**
 * Workspace tunables — the H3 (eviction) and H5 (interrupt) knobs the spec
 * hands to Tobias. Stored as a jsonb bag on the workspace row so a value,
 * once set, sticks across reloads. `resolveSettings` merges a row's partial
 * settings over the defaults and clamps to sane ranges.
 */

export interface WorkspaceSettings {
  /** Working-memory token budget (§10.2). The meter fills toward this. */
  tokenBudget: number;
  /**
   * H3 staleness weighting. How much recency dominates eviction ordering:
   * higher = the stalest items compress first regardless of importance;
   * 0 = evict purely by lowest importance (weight), age ignored. 1 is the
   * balanced default.
   */
  stalenessWeight: number;
  /**
   * H3 relevance weighting. How much an item's semantic relevance to the
   * current question protects it from eviction: higher = a stale-but-on-topic
   * item outlasts a fresh-but-irrelevant one; 0 = relevance ignored, eviction
   * runs on staleness vs. importance alone (the original behaviour). 1 is the
   * balanced default.
   */
  relevanceWeight: number;
  /**
   * H5 interrupt threshold. If a single turn would hydrate more than this
   * many new tokens, the agent pauses and asks before loading. The default
   * is "never ask" (act-and-narrate) — represented as MAX_SAFE_INTEGER
   * because JSON can't carry Infinity.
   */
  askAboveTokens: number;
}

export const NEVER_ASK = Number.MAX_SAFE_INTEGER;

export const DEFAULT_SETTINGS: WorkspaceSettings = {
  tokenBudget: 80_000,
  stalenessWeight: 1,
  relevanceWeight: 1,
  askAboveTokens: NEVER_ASK,
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function resolveSettings(raw: unknown): WorkspaceSettings {
  const s = (raw ?? {}) as Partial<WorkspaceSettings>;
  return {
    tokenBudget:
      typeof s.tokenBudget === "number"
        ? clamp(Math.round(s.tokenBudget), 4_000, 400_000)
        : DEFAULT_SETTINGS.tokenBudget,
    stalenessWeight:
      typeof s.stalenessWeight === "number"
        ? clamp(s.stalenessWeight, 0, 5)
        : DEFAULT_SETTINGS.stalenessWeight,
    relevanceWeight:
      typeof s.relevanceWeight === "number"
        ? clamp(s.relevanceWeight, 0, 5)
        : DEFAULT_SETTINGS.relevanceWeight,
    askAboveTokens:
      typeof s.askAboveTokens === "number" && s.askAboveTokens > 0
        ? Math.round(s.askAboveTokens)
        : DEFAULT_SETTINGS.askAboveTokens,
  };
}

/** True when the interrupt policy is active (a finite threshold is set). */
export function interruptsEnabled(settings: WorkspaceSettings): boolean {
  return settings.askAboveTokens < NEVER_ASK;
}
