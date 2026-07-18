import { routing, type JobKind } from "@/lib/llm/routing";

/** Reserved for visible output and hidden reasoning on the synthesis route. */
export const SYNTHESIS_OUTPUT_RESERVE_TOKENS = 4_096;
/** Compact navigation notes must never crowd out primary evidence. */
export const MAX_ORIENTATION_CONTEXT_TOKENS = 4_096;

export type ContextBlockKind = "evidence" | "orientation";

export interface ContextBlock {
  kind: ContextBlockKind;
  text: string;
}

/**
 * A deterministic tokenizer fallback used until a provider-compatible
 * tokenizer is installed. Crucially, planning and the request use this exact
 * same counter over the exact same rendered string; it is never a per-item
 * character estimate added after the fact.
 */
export function countPromptTokens(text: string): number {
  const pieces = text.trim().match(/[A-Za-z]+(?:'[A-Za-z]+)?|\d+(?:[.,]\d+)?|[^\s]/g);
  if (!pieces) return 0;
  // Long words commonly split into multiple BPE tokens. This conservative
  // approximation is stable across Node runtimes and avoids undercounting
  // prose while a model-specific tokenizer is unavailable.
  return pieces.reduce((total, piece) => total + Math.max(1, Math.ceil(piece.length / 4)), 0);
}

export function renderSynthesisPrompt(input: {
  question: string;
  blocks: readonly ContextBlock[];
}): string {
  return [
    "WORKING MEMORY:",
    input.blocks.map((block) => block.text).join("\n\n---\n\n") || "(empty — say so honestly)",
    "\n===\n",
    `Reader's question: ${input.question}`,
  ].join("\n");
}

export interface SynthesisBudget {
  providerContextTokens: number;
  outputReserveTokens: number;
  inputLimitTokens: number;
  basePromptTokens: number;
  evidenceTokens: number;
  orientationTokens: number;
  evidenceLimitTokens: number;
  orientationLimitTokens: number;
  renderedInputTokens: number;
}

/**
 * Select rendered context blocks under distinct evidence/orientation caps and
 * calculate the *whole rendered prompt* budget. The returned `renderedInputTokens`
 * is the number to compare with the provider limit and is intentionally not a
 * sum of stored working-memory costs.
 */
export function planSynthesisPrompt(input: {
  system: string;
  question: string;
  blocks: readonly ContextBlock[];
  detailedEvidenceBudgetTokens: number;
  job?: JobKind;
}): { prompt: string; blocks: ContextBlock[]; budget: SynthesisBudget } {
  const route = routing[input.job ?? "synthesis"];
  const providerContextTokens = route.contextWindowTokens ?? 32_768;
  const outputReserveTokens = SYNTHESIS_OUTPUT_RESERVE_TOKENS;
  const inputLimitTokens = providerContextTokens - outputReserveTokens;
  const basePromptTokens = countPromptTokens(input.system) + countPromptTokens(
    renderSynthesisPrompt({ question: input.question, blocks: [] }),
  );
  const remaining = Math.max(0, inputLimitTokens - basePromptTokens);
  const orientationLimitTokens = Math.min(MAX_ORIENTATION_CONTEXT_TOKENS, remaining);
  const evidenceLimitTokens = Math.max(
    0,
    Math.min(input.detailedEvidenceBudgetTokens, remaining - orientationLimitTokens),
  );

  let evidenceTokens = 0;
  let orientationTokens = 0;
  const selected: ContextBlock[] = [];
  for (const block of input.blocks) {
    const tokens = countPromptTokens(block.text);
    if (block.kind === "evidence") {
      if (evidenceTokens + tokens > evidenceLimitTokens) continue;
    } else {
      if (orientationTokens + tokens > orientationLimitTokens) continue;
    }
    // Count the request as it will actually be sent. In particular, every
    // extra block introduces a separator; summing isolated item estimates is
    // not sufficient for a provider-context guarantee.
    const candidate = [...selected, block];
    const candidatePrompt = renderSynthesisPrompt({ question: input.question, blocks: candidate });
    if (countPromptTokens(input.system) + countPromptTokens(candidatePrompt) > inputLimitTokens) {
      continue;
    }
    if (block.kind === "evidence") evidenceTokens += tokens;
    else orientationTokens += tokens;
    selected.push(block);
  }

  const prompt = renderSynthesisPrompt({ question: input.question, blocks: selected });
  const renderedInputTokens = countPromptTokens(input.system) + countPromptTokens(prompt);
  if (renderedInputTokens > inputLimitTokens) {
    // This can only happen when the configured system prompt/question itself
    // consumes the whole route. Do not send a request the provider must reject.
    throw new Error("Synthesis system prompt and question exceed the provider context window.");
  }

  return {
    prompt,
    blocks: selected,
    budget: {
      providerContextTokens,
      outputReserveTokens,
      inputLimitTokens,
      basePromptTokens,
      evidenceTokens,
      orientationTokens,
      evidenceLimitTokens,
      orientationLimitTokens,
      renderedInputTokens,
    },
  };
}
