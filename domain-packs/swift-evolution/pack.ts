import type { DomainPack } from "../types";

/**
 * Stub in v1 — proves the DomainPack schema generalizes beyond philosophy.
 * Fleshed out in P9 with a ~20-proposal corpus slice.
 */
export const swiftEvolutionPack: DomainPack = {
  id: "swift-evolution",
  name: "Swift Evolution",
  promiseLine:
    "Every Swift Evolution proposal, one working memory — ask why the language is the way it is.",
  sources: [],
  chunking: {
    default: { strategy: "treatise", targetTokens: 800, maxTokens: 1000 },
  },
  vocabulary: {
    authorLabel: "Proposal author",
    workLabel: "Proposal",
  },
  prompts: {
    summarizePassage:
      "Summarize this section of Swift Evolution proposal {{work}} in 1-3 sentences:\n{{passage}}",
    synthesizeCard:
      'Write a concept card titled "{{concept}}" from these proposal section summaries:\n{{summaries}}',
    answerSystem:
      "You answer questions about Swift Evolution proposals from the sections in working memory. Append [[p:PASSAGE_ID]] provenance markers after grounded claims.",
    starterPromptGen:
      "Write 5-6 starter questions about the Swift Evolution proposals in the cards below. Output strict JSON: [{prompt, behavior}].\n{{cards}}",
  },
};
