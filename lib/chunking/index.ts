import type { ChunkingRules } from "@/domain-packs/types";

/**
 * Structure-aware chunking (§9.2). Three strategies, selected per author via
 * the pack's ChunkingSpec:
 *
 * - "dialogue"  — group paragraphs on speaker-exchange boundaries to a target
 *                 token range.
 * - "aphorism"  — one passage per numbered aphorism/section, merging tiny
 *                 neighbors.
 * - "treatise"  — chunk on section headings with a soft token cap and
 *                 one-paragraph overlap between chunks of the same section.
 *
 * Every passage carries ordinal, char offsets into the cleaned source text,
 * the heading breadcrumb it falls under, and an estimated token count.
 */

export interface Passage {
  ordinal: number;
  text: string;
  heading: string | null;
  charStart: number;
  charEnd: number;
  tokenCount: number;
}

/** ~4 chars/token is close enough for budget math on English prose. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

interface Block {
  text: string;
  start: number;
  end: number;
}

/** Split cleaned text into paragraph blocks, preserving char offsets. */
function splitBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  const re = /[^\n][\s\S]*?(?=\n\s*\n|$)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const text = match[0];
    if (text.trim().length === 0) continue;
    blocks.push({ text, start: match.index, end: match.index + text.length });
  }
  return blocks;
}

/**
 * A heading in a Gutenberg plaintext is a short, standalone, mostly-uppercase
 * line ("BOOK IV.", "CHAPTER I. OF SPACE.", "FIRST PART. THE THREE
 * METAMORPHOSES.").
 */
function isHeading(block: Block): boolean {
  const t = block.text.trim();
  if (t.includes("\n") || t.length > 90) return false;
  const letters = t.replace(/[^a-zA-Z]/g, "");
  if (letters.length === 0) return false;
  const upper = letters.replace(/[^A-Z]/g, "");
  return upper.length / letters.length > 0.9;
}

/** Aphorism openers: "42." / "42" alone / "42. The Will to Truth…". */
function isAphorismStart(block: Block): boolean {
  return /^\s*\d{1,4}\.?(\s|$)/.test(block.text);
}

/** Speaker turn in a dialogue: "PHAEDRUS:" / "SOCRATES:". */
function isSpeakerTurn(block: Block): boolean {
  return /^[A-Z][A-Z' ]{1,30}:/.test(block.text.trim());
}

function makePassage(
  blocks: Block[],
  source: string,
  heading: string | null,
  ordinal: number,
): Passage {
  const first = blocks[0];
  const last = blocks[blocks.length - 1];
  if (!first || !last) throw new Error("makePassage called with no blocks");
  const text = source.slice(first.start, last.end);
  return {
    ordinal,
    text,
    heading,
    charStart: first.start,
    charEnd: last.end,
    tokenCount: estimateTokens(text),
  };
}

/**
 * dialogue — accumulate paragraphs toward targetTokens, preferring to break
 * at speaker turns; never exceed maxTokens unless a single paragraph does.
 */
function chunkDialogue(source: string, rules: ChunkingRules): Passage[] {
  const passages: Passage[] = [];
  let heading: string | null = null;
  let current: Block[] = [];
  let currentTokens = 0;

  const flush = () => {
    if (current.length === 0) return;
    passages.push(makePassage(current, source, heading, passages.length));
    current = [];
    currentTokens = 0;
  };

  for (const block of splitBlocks(source)) {
    if (isHeading(block)) {
      flush();
      heading = block.text.trim();
      continue;
    }
    const tokens = estimateTokens(block.text);
    const wouldExceedMax = currentTokens + tokens > rules.maxTokens;
    const pastTargetAtTurn =
      currentTokens >= rules.targetTokens * 0.8 && isSpeakerTurn(block);
    if (current.length > 0 && (wouldExceedMax || pastTargetAtTurn)) {
      flush();
    }
    current.push(block);
    currentTokens += tokens;
  }
  flush();
  return passages;
}

/**
 * aphorism — a new passage begins at each numbered section or heading; runs
 * of tiny aphorisms under the same heading merge until they reach a readable
 * size (a third of target).
 */
function chunkAphorism(source: string, rules: ChunkingRules): Passage[] {
  const minTokens = Math.floor(rules.targetTokens / 3);
  const passages: Passage[] = [];
  let heading: string | null = null;
  let current: Block[] = [];
  let currentTokens = 0;

  const flush = () => {
    if (current.length === 0) return;
    passages.push(makePassage(current, source, heading, passages.length));
    current = [];
    currentTokens = 0;
  };

  for (const block of splitBlocks(source)) {
    if (isHeading(block)) {
      flush();
      heading = block.text.trim();
      continue;
    }
    const tokens = estimateTokens(block.text);
    const startsAphorism = isAphorismStart(block);
    // merge tiny previous aphorisms; break once current has substance
    if (
      current.length > 0 &&
      ((startsAphorism && currentTokens >= minTokens) ||
        currentTokens + tokens > rules.maxTokens)
    ) {
      flush();
    }
    current.push(block);
    currentTokens += tokens;
  }
  flush();
  return passages;
}

/**
 * treatise — a heading always starts a new passage; within a section, chunks
 * flush at the soft cap and the next chunk re-opens with the previous
 * chunk's final paragraph (overlapParagraphs).
 */
function chunkTreatise(source: string, rules: ChunkingRules): Passage[] {
  const overlap = rules.overlapParagraphs ?? 0;
  const passages: Passage[] = [];
  let heading: string | null = null;
  let current: Block[] = [];
  let currentTokens = 0;

  const flush = (withOverlap: boolean) => {
    if (current.length === 0) return;
    passages.push(makePassage(current, source, heading, passages.length));
    const carried = withOverlap ? current.slice(-overlap) : [];
    current = [...carried];
    currentTokens = carried.reduce((s, b) => s + estimateTokens(b.text), 0);
  };

  for (const block of splitBlocks(source)) {
    if (isHeading(block)) {
      flush(false);
      heading = block.text.trim();
      continue;
    }
    const tokens = estimateTokens(block.text);
    if (current.length > 0 && currentTokens + tokens > rules.maxTokens) {
      flush(true);
    }
    current.push(block);
    currentTokens += tokens;
  }
  flush(false);
  return passages;
}

export function chunkWork(source: string, rules: ChunkingRules): Passage[] {
  switch (rules.strategy) {
    case "dialogue":
      return chunkDialogue(source, rules);
    case "aphorism":
      return chunkAphorism(source, rules);
    case "treatise":
      return chunkTreatise(source, rules);
  }
}
