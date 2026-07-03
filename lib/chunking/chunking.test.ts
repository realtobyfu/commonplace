import { describe, expect, it } from "vitest";
import { chunkWork, estimateTokens, type Passage } from "./index";

const para = (s: string) => s.repeat(1);

function expectOffsetsMatch(passages: Passage[], source: string) {
  for (const p of passages) {
    expect(source.slice(p.charStart, p.charEnd)).toBe(p.text);
  }
}

describe("treatise strategy", () => {
  const rules = {
    strategy: "treatise" as const,
    targetTokens: 50,
    maxTokens: 60,
    overlapParagraphs: 1,
  };

  it("starts a new passage at each heading and records the breadcrumb", () => {
    const source = [
      "CHAPTER I. OF SPACE.",
      para("Space is a necessary representation a priori. ".repeat(5)),
      "CHAPTER II. OF TIME.",
      para("Time is not an empirical conception. ".repeat(7)),
    ].join("\n\n");

    const passages = chunkWork(source, rules);
    expect(passages).toHaveLength(2);
    expect(passages[0]?.heading).toBe("CHAPTER I. OF SPACE.");
    expect(passages[1]?.heading).toBe("CHAPTER II. OF TIME.");
    expectOffsetsMatch(passages, source);
  });

  it("flushes at the soft cap with one-paragraph overlap", () => {
    const p1 = "First paragraph of the section. ".repeat(7).trim();
    const p2 = "Second paragraph carries the argument. ".repeat(7).trim();
    const p3 = "Third paragraph concludes it. ".repeat(8).trim();
    const source = ["THE SECTION.", p1, p2, p3].join("\n\n");

    const passages = chunkWork(source, {
      ...rules,
      targetTokens: 100,
      maxTokens: 120,
    });
    expect(passages.length).toBeGreaterThan(1);
    // overlap: each chunk opens with the paragraph that closed the previous one
    for (let i = 1; i < passages.length; i++) {
      const opening = passages[i]?.text.slice(0, 20) ?? "";
      expect(passages[i - 1]?.text).toContain(opening);
    }
  });
});

describe("aphorism strategy", () => {
  const rules = {
    strategy: "aphorism" as const,
    targetTokens: 60,
    maxTokens: 120,
  };

  it("splits on numbered aphorisms once passages have substance", () => {
    const big = (n: number) =>
      `${n}. ${"A substantial aphorism about morality and its origins. ".repeat(6).trim()}`;
    const source = [big(1), big(2), big(3)].join("\n\n");

    const passages = chunkWork(source, rules);
    expect(passages).toHaveLength(3);
    expect(passages[1]?.text.startsWith("2.")).toBe(true);
    expectOffsetsMatch(passages, source);
  });

  it("merges tiny aphorisms with their neighbors", () => {
    const opener = `1. ${"A substantial opening aphorism that establishes the book's voice. ".repeat(4).trim()}`;
    const tiny = (n: number) => `${n}. Brevity.`;
    const source = [opener, tiny(2), tiny(3), tiny(4)].join("\n\n");

    const passages = chunkWork(source, rules);
    expect(passages).toHaveLength(2);
    expect(passages[1]?.text).toContain("2. Brevity.");
    expect(passages[1]?.text).toContain("4. Brevity.");
  });
});

describe("dialogue strategy", () => {
  const rules = {
    strategy: "dialogue" as const,
    targetTokens: 100,
    maxTokens: 200,
  };

  it("prefers to break at speaker turns after nearing the target", () => {
    const socrates = `SOCRATES: ${"What then is justice, and how shall we find it in the city? ".repeat(5).trim()}`;
    const glaucon = `GLAUCON: ${"I cannot say, Socrates, though I have often wondered about it. ".repeat(5).trim()}`;
    const source = [socrates, glaucon, socrates, glaucon].join("\n\n");

    const passages = chunkWork(source, rules);
    expect(passages.length).toBeGreaterThan(1);
    for (const p of passages.slice(1)) {
      expect(/^[A-Z]+:/.test(p.text)).toBe(true);
    }
    expectOffsetsMatch(passages, source);
  });

  it("never exceeds maxTokens across grouped paragraphs", () => {
    const line = "An exchange of moderate length in the ongoing dialogue between them. ";
    const source = Array.from({ length: 12 }, () => line.repeat(4).trim()).join(
      "\n\n",
    );
    const passages = chunkWork(source, rules);
    expect(passages.length).toBeGreaterThan(0);
    for (const p of passages) {
      // single paragraphs may exceed; grouped ones must not
      if (p.text.includes("\n\n")) {
        expect(p.tokenCount).toBeLessThanOrEqual(rules.maxTokens);
      }
    }
  });
});

describe("front matter (H1 amendment 1)", () => {
  const rules = {
    strategy: "treatise" as const,
    targetTokens: 100,
    maxTokens: 150,
    skipHeadings: ["^CONTENTS", "^INTRODUCTION AND ANALYSIS"],
  };

  it("skips title-page lines, contents, and skipped sections", () => {
    const body = "The argument proper begins here and continues at length. ".repeat(4).trim();
    const source = [
      "By The Author",
      "Translated by A Translator",
      "CONTENTS.",
      "BOOK I.\n BOOK II.",
      "INTRODUCTION AND ANALYSIS.",
      "The translator's ninety-thousand-word commentary would go here. ".repeat(4).trim(),
      "BOOK I.",
      body,
    ].join("\n\n");

    const passages = chunkWork(source, rules);
    expect(passages).toHaveLength(1);
    expect(passages[0]?.heading).toBe("BOOK I.");
    expect(passages[0]?.text).toBe(body);
    expectOffsetsMatch(passages, source);
  });

  it("keeps body sections whose headings don't match", () => {
    const source = [
      "PREFACE.",
      "The author's own preface, which is content. ".repeat(6).trim(),
    ].join("\n\n");
    const passages = chunkWork(source, { ...rules, skipHeadings: ["^CONTENTS"] });
    expect(passages).toHaveLength(1);
    expect(passages[0]?.heading).toBe("PREFACE.");
  });
});

describe("oversized paragraphs (H1 amendment 2)", () => {
  it("sentence-splits single paragraphs past the soft cap", () => {
    const rules = { strategy: "treatise" as const, targetTokens: 50, maxTokens: 60 };
    const giant = "A sentence of respectable length about the categorical imperative. ".repeat(20).trim();
    const source = `THE SECTION.\n\n${giant}`;

    const passages = chunkWork(source, rules);
    expect(passages.length).toBeGreaterThan(1);
    for (const p of passages) {
      expect(p.tokenCount).toBeLessThanOrEqual(rules.maxTokens * 1.25);
      // splits land on sentence boundaries
      expect(/^[A-Z]/.test(p.text.trim())).toBe(true);
    }
    expectOffsetsMatch(passages, source);
    // no text lost
    expect(passages.map((p) => p.text).join("")).toBe(giant);
  });
});

describe("estimateTokens", () => {
  it("approximates 4 chars per token", () => {
    expect(estimateTokens("a".repeat(400))).toBe(100);
  });
});
