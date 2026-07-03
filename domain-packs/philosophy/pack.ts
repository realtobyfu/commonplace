import type { DomainPack } from "../types";

/**
 * The reference domain pack. Sources are populated by scripts/fetch-corpus.ts
 * research (corpus/manifest.json is the source of truth for what was actually
 * fetched); the list here is the intent.
 *
 * promiseLine is a DRAFT — HUMAN GATE H7 swaps in the final line.
 */
export const philosophyPack: DomainPack = {
  id: "philosophy",
  name: "Philosophy Canon",
  promiseLine:
    "A commonplace book that reads for you — six thinkers, one working memory, watch it think.",
  sources: [], // populated from corpus/manifest.json after P1 fetch
  chunking: {
    default: {
      strategy: "treatise",
      targetTokens: 1000,
      maxTokens: 1200,
      overlapParagraphs: 1,
      skipHeadings: ["^CONTENTS", "^INDEX", "^TRANSLATOR'?S"],
    },
    perAuthor: {
      plato: {
        strategy: "dialogue",
        targetTokens: 750,
        maxTokens: 900,
        // Jowett prefixes each dialogue with his own long commentary
        skipHeadings: ["^CONTENTS", "^INTRODUCTION( AND ANALYSIS)?\\b", "^ANALYSIS"],
      },
      nietzsche: {
        strategy: "aphorism",
        targetTokens: 600,
        maxTokens: 1200,
        // editor/translator front matter (e.g. Frau Förster-Nietzsche's
        // introduction to Zarathustra); Nietzsche's own prefaces stay
        skipHeadings: ["^CONTENTS", "^INTRODUCTION BY", "^TRANSLATOR'?S"],
      },
    },
  },
  vocabulary: {
    authorLabel: "Thinker",
    workLabel: "Work",
  },
  prompts: {
    summarizePassage: [
      "Summarize this passage from {{work}} by {{author}} in 1-3 sentences.",
      "Preserve the philosophical claim being made, not just the topic.",
      "Write for someone deciding whether to read the full passage.",
      "",
      "Passage:",
      "{{passage}}",
    ].join("\n"),
    synthesizeCard: [
      "You are compiling a commonplace book of the philosophy canon.",
      'Write a concept card titled "{{concept}}" from the passage summaries below.',
      "The card is 150-250 words: what the thinker(s) actually claim, where they",
      "differ, and which works carry the argument. No filler, no hedging.",
      "",
      "Summaries:",
      "{{summaries}}",
    ].join("\n"),
    answerSystem: [
      "You are the reading companion for a commonplace book of the philosophy",
      "canon. Answer from the passages and concept cards in your working memory",
      "— they are quoted below. After each claim grounded in a passage, append",
      "a provenance marker of the form [[p:PASSAGE_ID]] using the passage's id.",
      "If working memory does not cover the question, say what is missing",
      "rather than inventing content.",
    ].join("\n"),
    starterPromptGen: [
      "You are writing starter prompts for a workspace over the philosophy",
      "canon. Given the concept cards below, write 5-6 questions a curious",
      "reader would actually ask. Bias toward concepts that span multiple",
      "thinkers. For each, label the memory behavior it will trigger:",
      '"cross-thinker" (two authors hydrate side by side), "sequential"',
      '(cards accumulate), or "deep-dive" (one work unfolds).',
      "Output strict JSON: [{prompt, behavior}].",
      "",
      "Concept cards:",
      "{{cards}}",
    ].join("\n"),
  },
  conceptSeeds: [
    "the will",
    "ressentiment",
    "the forms",
    "dialectic",
    "the categorical imperative",
    "eternal recurrence",
    "justice",
    "aesthetic contemplation",
    "master and slave morality",
    "the thing-in-itself",
  ],
};
