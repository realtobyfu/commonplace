/**
 * Model routing (§15, amended per docs/decisions.md): one config object.
 * Every paid job runs on Groq's cheapest adequate model (H4 verdict);
 * embeddings run locally on Ollama because Groq serves none.
 */

export type JobKind =
  | "summarize"
  | "concept_card"
  | "starter_prompts"
  | "router"
  | "synthesis"
  | "embed"
  // Offline evaluation (eval/faithfulness.ts) — an LLM judge, not a
  // request-path job. Metered like the rest so eval spend shows up in `costs`.
  | "eval_faithfulness";

export type Provider = "groq" | "ollama";

export interface Route {
  provider: Provider;
  model: string;
}

export const routing: Record<JobKind, Route> = {
  summarize: { provider: "groq", model: "llama-3.1-8b-instant" },
  router: { provider: "groq", model: "openai/gpt-oss-20b" },
  concept_card: { provider: "groq", model: "openai/gpt-oss-120b" },
  starter_prompts: { provider: "groq", model: "openai/gpt-oss-120b" },
  synthesis: { provider: "groq", model: "openai/gpt-oss-120b" },
  embed: { provider: "ollama", model: "nomic-embed-text" },
  // Judging faithfulness needs stronger reasoning than the cheap models —
  // the 120b that writes answers also grades them.
  eval_faithfulness: { provider: "groq", model: "openai/gpt-oss-120b" },
};

/** $ per MTok — docs/ralph/groq-research.md (retrieved 2026-07-02). */
export const PRICING: Record<string, { inPerMTok: number; outPerMTok: number }> = {
  "llama-3.1-8b-instant": { inPerMTok: 0.05, outPerMTok: 0.08 },
  "llama-3.3-70b-versatile": { inPerMTok: 0.59, outPerMTok: 0.79 },
  "openai/gpt-oss-20b": { inPerMTok: 0.075, outPerMTok: 0.3 },
  "openai/gpt-oss-120b": { inPerMTok: 0.15, outPerMTok: 0.6 },
};

/**
 * Reasoning models emit thinking tokens that Groq mixes into content unless
 * `reasoning_format: "hidden"` is sent — but non-reasoning models (the Llama
 * family) reject that parameter with a 400. Verified live in both directions.
 */
export function isReasoningModel(model: string): boolean {
  return model.includes("gpt-oss") || model.includes("qwen") || model.includes("deepseek");
}

export function computeCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const price = PRICING[model];
  if (!price) return 0; // local models are free
  return (
    (inputTokens * price.inPerMTok + outputTokens * price.outPerMTok) / 1_000_000
  );
}
