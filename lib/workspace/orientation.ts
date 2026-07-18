import { estimateTokens } from "@/lib/chunking";

export const MAX_ORIENTATION_TOKENS = 60;

/**
 * Enforce the prompt budget for an LLM-written work orientation. Prefer a
 * complete final sentence; when there is no nearby boundary, use an ellipsis
 * rather than letting a compact-memory item silently exceed its allocation.
 */
export function capOrientationSummary(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (estimateTokens(normalized) <= MAX_ORIENTATION_TOKENS) return normalized;

  const maxChars = MAX_ORIENTATION_TOKENS * 4;
  const candidate = normalized.slice(0, maxChars);
  const boundaries = [...candidate.matchAll(/[.!?](?=\s|$)/g)];
  const last = boundaries.at(-1);
  // Avoid reducing a useful note to a very short opening sentence merely
  // because it happened to contain a period early in the model's response.
  if (last && last.index !== undefined && last.index >= maxChars * 0.6) {
    return candidate.slice(0, last.index + 1);
  }
  return `${normalized.slice(0, maxChars - 1).trimEnd()}…`;
}
