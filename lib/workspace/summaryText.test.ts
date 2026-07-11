import { describe, expect, it } from "vitest";
import { stripSummaryPreamble } from "./summaryText";

describe("stripSummaryPreamble", () => {
  it("drops a scaffolding preamble ending in a colon", () => {
    const text =
      "Here's a 1-3 sentence summary of the passage from Kant's Fundamental Principles, preserving the philosophical claim being made:\n\nKant argues that the only source of a moral law is the inherent worth of rational beings.";
    expect(stripSummaryPreamble(text)).toBe(
      "Kant argues that the only source of a moral law is the inherent worth of rational beings.",
    );
  });

  it("drops a preamble that names 'summary' without a trailing colon", () => {
    const text =
      "Sure, here is a summary of the passage\n\nThe will is the thing-in-itself, per Schopenhauer.";
    expect(stripSummaryPreamble(text)).toBe(
      "The will is the thing-in-itself, per Schopenhauer.",
    );
  });

  it("drops an 'if you're considering reading' preamble", () => {
    const text =
      'If you\'re considering reading Nietzsche\'s "The Antichrist," here\'s a summary of the philosophical claim being made in 1-3 sentences:\n\nNietzsche critiques Christianity as a form of nihilism that stifles individual creativity.';
    expect(stripSummaryPreamble(text)).toBe(
      "Nietzsche critiques Christianity as a form of nihilism that stifles individual creativity.",
    );
  });

  it("leaves a single-paragraph 'if you're considering reading' summary untouched (content is woven in, not a separate preamble)", () => {
    const text =
      "If you're considering reading the Swift Evolution proposal SE-0200, it's worth noting that the original design for raw string literals was rejected due to not fitting the language's aesthetic.";
    expect(stripSummaryPreamble(text)).toBe(text);
  });

  it("leaves ordinary summary text untouched", () => {
    const text =
      "Nietzsche attacks the moral elevation of pity as a dangerous value that weakens humanity.";
    expect(stripSummaryPreamble(text)).toBe(text);
  });

  it("leaves a single-paragraph refusal untouched (no content to fall back to)", () => {
    const text =
      "Unfortunately, you haven't provided the passage from The Genealogy of Morals by Nietzsche. Please provide the passage, and I'll be happy to summarize it for you.";
    expect(stripSummaryPreamble(text)).toBe(text);
  });

  it("does not strip a real analytic paragraph that happens to start with 'Note:'-adjacent prose", () => {
    const text =
      "Notebooks from this period show Kant revising his terms.\n\nThe categorical imperative emerges only in the later drafts.";
    expect(stripSummaryPreamble(text)).toBe(text);
  });
});
