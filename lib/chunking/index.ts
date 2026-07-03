import type { ChunkingRules } from "@/domain-packs/types";

/**
 * Structure-aware chunking (§9.2, verdict recorded under H1 in
 * docs/decisions.md). Three strategies, selected per author via the pack's
 * ChunkingSpec:
 *
 * - "dialogue"  — group paragraphs on speaker-exchange boundaries to a target
 *                 token range.
 * - "aphorism"  — one passage per numbered aphorism/section, merging tiny
 *                 neighbors.
 * - "treatise"  — chunk on section headings with a soft token cap and
 *                 one-paragraph overlap between chunks of the same section.
 *
 * Front matter never becomes passages: short title-page lines and any section
 * whose heading matches the rules' skipHeadings patterns (contents pages,
 * translator introductions) are dropped before chunking. Passages that still
 * exceed the soft cap — single giant paragraphs — are split at sentence
 * boundaries afterward.
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

interface ContentBlock extends Block {
  heading: string | null;
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

/**
 * Resolve headings and drop front matter. Title-page lines (short blocks
 * before the first heading or first substantial paragraph) and every section
 * whose heading matches a skipHeadings pattern are removed; what remains is
 * body text annotated with its heading breadcrumb.
 */
/** Contents pages: several lines, most of them short list entries. */
function looksLikeList(block: Block): boolean {
  const lines = block.text.split("\n");
  if (lines.length < 3) return false;
  const short = lines.filter((l) => l.trim().length < 60).length;
  return short / lines.length >= 0.8;
}

function contentBlocks(source: string, rules: ChunkingRules): ContentBlock[] {
  const skipPatterns = (rules.skipHeadings ?? []).map(
    (p) => new RegExp(p, "i"),
  );
  const out: ContentBlock[] = [];
  let heading: string | null = null;
  let skipping = false;
  let inBody = false; // flips at the first substantial body paragraph

  for (const block of splitBlocks(source)) {
    if (isHeading(block)) {
      heading = block.text.trim();
      skipping = skipPatterns.some((re) => re.test(heading ?? ""));
      continue;
    }
    if (skipping) continue;
    // until real prose appears, short lines ("By Plato", "Translated by…")
    // and list-shaped blocks (contents pages) are front matter
    if (!inBody && (block.text.length < 200 || looksLikeList(block))) continue;
    inBody = true;
    out.push({ ...block, heading });
  }
  return out;
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
): Omit<Passage, "ordinal"> {
  const first = blocks[0];
  const last = blocks[blocks.length - 1];
  if (!first || !last) throw new Error("makePassage called with no blocks");
  const text = source.slice(first.start, last.end);
  return {
    text,
    heading,
    charStart: first.start,
    charEnd: last.end,
    tokenCount: estimateTokens(text),
  };
}

type DraftPassage = Omit<Passage, "ordinal">;

/**
 * Shared accumulation loop. Strategies differ only in when they cut, so each
 * provides a predicate: given the accumulated token count and the next block,
 * should the current passage flush first?
 */
function accumulate(
  blocks: ContentBlock[],
  source: string,
  shouldFlushBefore: (currentTokens: number, next: ContentBlock) => boolean,
  overlapParagraphs = 0,
): DraftPassage[] {
  const passages: DraftPassage[] = [];
  let heading: string | null = null;
  let current: ContentBlock[] = [];
  let currentTokens = 0;

  const flush = (withOverlap: boolean) => {
    if (current.length === 0) return;
    passages.push(makePassage(current, source, heading));
    const carried = withOverlap ? current.slice(-overlapParagraphs) : [];
    current = [...carried];
    currentTokens = carried.reduce((s, b) => s + estimateTokens(b.text), 0);
  };

  for (const block of blocks) {
    if (block.heading !== heading) {
      flush(false); // a new section never inherits overlap
      heading = block.heading;
    } else if (current.length > 0 && shouldFlushBefore(currentTokens, block)) {
      flush(overlapParagraphs > 0);
    }
    current.push(block);
    currentTokens += estimateTokens(block.text);
  }
  flush(false);
  return passages;
}

/**
 * Split any passage still exceeding the soft cap (a single giant paragraph)
 * at sentence boundaries. Offsets stay exact because pieces are contiguous
 * slices of the source.
 */
function splitOversized(
  passages: DraftPassage[],
  maxTokens: number,
): DraftPassage[] {
  const out: DraftPassage[] = [];
  const sentenceRe = /[\s\S]*?(?:[.!?][)"'”’\]]*(?:\s+|$)|$)/g;

  for (const p of passages) {
    if (p.tokenCount <= maxTokens * 1.25) {
      out.push(p);
      continue;
    }
    let pieceStart = 0; // offset within p.text
    let pieceLen = 0;
    sentenceRe.lastIndex = 0;
    let match: RegExpExecArray | null;
    const emit = () => {
      const text = p.text.slice(pieceStart, pieceStart + pieceLen);
      if (text.trim().length === 0) return;
      out.push({
        text,
        heading: p.heading,
        charStart: p.charStart + pieceStart,
        charEnd: p.charStart + pieceStart + pieceLen,
        tokenCount: estimateTokens(text),
      });
    };
    while ((match = sentenceRe.exec(p.text)) !== null && match[0].length > 0) {
      if (
        pieceLen > 0 &&
        estimateTokens(p.text.slice(pieceStart, pieceStart + pieceLen + match[0].length)) > maxTokens
      ) {
        emit();
        pieceStart += pieceLen;
        pieceLen = 0;
      }
      pieceLen += match[0].length;
    }
    pieceLen = p.text.length - pieceStart;
    emit();
  }
  return out;
}

export function chunkWork(source: string, rules: ChunkingRules): Passage[] {
  const blocks = contentBlocks(source, rules);
  let drafts: DraftPassage[];

  switch (rules.strategy) {
    case "dialogue":
      // break at the max, or at a speaker turn once past ~80% of target
      drafts = accumulate(blocks, source, (tokens, next) => {
        const nextTokens = estimateTokens(next.text);
        return (
          tokens + nextTokens > rules.maxTokens ||
          (tokens >= rules.targetTokens * 0.8 && isSpeakerTurn(next))
        );
      });
      break;
    case "aphorism":
      // a numbered aphorism starts a new passage once current has substance
      drafts = accumulate(blocks, source, (tokens, next) => {
        const nextTokens = estimateTokens(next.text);
        return (
          tokens + nextTokens > rules.maxTokens ||
          (isAphorismStart(next) && tokens >= rules.targetTokens / 3)
        );
      });
      break;
    case "treatise":
      drafts = accumulate(
        blocks,
        source,
        (tokens, next) => tokens + estimateTokens(next.text) > rules.maxTokens,
        rules.overlapParagraphs ?? 0,
      );
      break;
  }

  return splitOversized(drafts, rules.maxTokens).map((p, ordinal) => ({
    ...p,
    ordinal,
  }));
}
