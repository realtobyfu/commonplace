/**
 * Stored `summaries` rows (§13.2: work-summary drill-down, "About <work>"
 * cards) sometimes carry the summarizer's chat scaffolding ahead of the
 * actual content — "Here's a 1-3 sentence summary of the passage,
 * preserving the philosophical claim being made:\n\n<real summary>" — a
 * prompt-compliance artifact from the summarization pass, not something
 * every caller should have to re-detect. Passages themselves (raw source
 * text) never have this shape, so this only applies to summary text.
 */

const SCAFFOLD_START_RE =
  /^(here'?s?\s+is|here'?s|sure,|certainly,|okay,|alright,|i'll|i will|let me|unfortunately,|note:|if you'?re considering reading)/i;
const SCAFFOLD_HINT_RE = /\b(summary|summarize|passage)\b/i;

/** Drop a leading scaffolding paragraph, keeping the rest verbatim. */
export function stripSummaryPreamble(text: string): string {
  const parts = text.split(/\n\s*\n/);
  if (parts.length < 2) return text;
  const first = (parts[0] ?? "").trim();
  if (
    SCAFFOLD_START_RE.test(first) &&
    (SCAFFOLD_HINT_RE.test(first) || first.endsWith(":"))
  ) {
    return parts.slice(1).join("\n\n").trim();
  }
  return text;
}
