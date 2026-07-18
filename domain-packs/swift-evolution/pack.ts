import type { DomainPack } from "../types";

/**
 * The second pack (P9): a 20-proposal slice of Swift Evolution, proving the
 * pack architecture generalizes — same UI, different vocabulary, no code
 * changes outside domain-packs/. Corpus manifest lives at
 * corpus/swift-evolution/manifest.json (Apache 2.0 w/ Runtime Library
 * Exception).
 */
export const swiftEvolutionPack: DomainPack = {
  id: "swift-evolution",
  name: "Swift Evolution",
  promiseLine:
    "Every Swift Evolution proposal, one working memory — ask why the language is the way it is.",
  sources: [], // populated from corpus/swift-evolution/manifest.json
  chunking: {
    // Proposals are markdown treatises: chunk on ## headings, modest size —
    // sections are dense and self-contained compared to philosophy prose.
    default: {
      strategy: "treatise",
      targetTokens: 800,
      maxTokens: 1000,
      overlapParagraphs: 1,
      skipHeadings: ["^Revision [Hh]istory", "^Acknowledg", "^Implementation( notes)?$"],
    },
  },
  vocabulary: {
    authorLabel: "Proposal author",
    workLabel: "Proposal",
  },
  prompts: {
    summarizePassage: [
      "Summarize this section of Swift Evolution proposal {{work}} in 1-3",
      "sentences. Preserve the design decision or trade-off being made, not",
      "just the topic. Write for an engineer deciding whether to read it.",
      "",
      "Section:",
      "{{passage}}",
    ].join("\n"),
    summarizeWorkOrientation: [
      "Write one factual 40-60 token orientation abstract of the Swift proposal",
      "{{work}} from the section summaries below. Name its design purpose, the main",
      "decision, and the major tradeoffs. Do not use quotations, citations, scaffolding,",
      "or claims beyond these summaries. This is orientation only, not primary evidence.",
      "",
      "Section summaries:",
      "{{summaries}}",
    ].join("\n"),
    synthesizeCard: [
      "You are compiling a design history of the Swift language.",
      'Write a concept card titled "{{concept}}" from the proposal section',
      "summaries below. The card is 150-250 words: what was decided, what",
      "alternatives were rejected and why, and which proposals carry the",
      "design. No filler.",
      "",
      "Summaries:",
      "{{summaries}}",
    ].join("\n"),
    answerSystem: [
      "You are the reading companion for the Swift Evolution archive. Answer",
      "from the proposal sections and concept cards in your working memory —",
      "they are quoted below. After each claim grounded in a section, append",
      "a provenance marker of the form [[p:PASSAGE_ID]] using the section's",
      "id. If working memory does not cover the question, say what is",
      "missing rather than inventing history.",
    ].join("\n"),
    starterPromptGen: [
      "You are writing starter prompts for a workspace over the Swift",
      "Evolution archive. Given the concept cards below, write 5-6 questions",
      "a working Swift engineer would actually ask about why the language is",
      "designed the way it is. Bias toward design threads spanning multiple",
      'proposals. Label each with the memory behavior it triggers:',
      '"cross-thinker" (two proposals hydrate side by side), "sequential"',
      '(cards accumulate), or "deep-dive" (one proposal unfolds).',
      "The prompt text itself must read as a natural question — never mention",
      "the label, the workspace, memory, or why the question fits a category.",
      "Output strict JSON: [{prompt, behavior}].",
      "",
      "Concept cards:",
      "{{cards}}",
    ].join("\n"),
  },
  conceptSeeds: [
    "concurrency",
    "actors",
    "async/await",
    "result builders",
    "Sendable",
    "macros",
    "opaque types",
    "ownership",
    "generics",
    "source compatibility",
  ],
};
