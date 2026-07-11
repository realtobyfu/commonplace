"use client";

import { useEffect } from "react";

/**
 * The passage a provenance chip opens (§13.3): exact source text with its
 * work, author, and ordinal — proof, not paraphrase. A quiet centered sheet
 * over the conversation; Escape or the scrim closes it.
 */

export interface PassageDetail {
  passageId: string;
  ordinal: number;
  heading: string | null;
  text: string;
  workTitle: string;
  author: string;
  cardIds: string[];
}

/**
 * Corpus text arrives with the source's hard line wraps (Gutenberg plain
 * text), which read as ragged mid-sentence breaks on screen. Reflow it:
 * blank lines and speaker turns ("SOCRATES: …") start paragraphs; single
 * newlines inside a paragraph are soft wraps and collapse to spaces. The
 * words themselves are untouched — this is layout, not paraphrase.
 */
export function reflowSource(text: string): string[] {
  const paragraphs: string[] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length) {
      paragraphs.push(current.join(" ").replace(/[ \t]{2,}/g, " ").trim());
      current = [];
    }
  };
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line === "") {
      flush();
    } else if (/^[A-Z][A-Z'’ .-]{2,}:/.test(line)) {
      // A new speaker turn — dialogue reads best one turn per paragraph.
      flush();
      current.push(line);
    } else {
      current.push(line);
    }
  }
  flush();
  return paragraphs;
}

/** "plato" → "Plato" — authors are stored lowercase in some packs. */
export function displayAuthor(author: string): string {
  return author.replace(/\b\p{L}/gu, (ch) => ch.toUpperCase());
}

/** Gutenberg sources mark emphasis as _underscores_; render them as the
 *  italics the print edition had rather than literal punctuation. */
function SourceLine({ text }: { text: string }) {
  const parts = text.split(/_([^_]+)_/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? <em key={i}>{part}</em> : <span key={i}>{part}</span>,
      )}
    </>
  );
}

export function PassageOverlay({
  passage,
  onClose,
}: {
  passage: PassageDetail;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-ink/25 p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${passage.workTitle}, passage ${passage.ordinal}`}
    >
      <div
        className="flex max-h-[78vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-structure-strong bg-paper shadow-[0_8px_40px_rgba(22,25,29,0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-structure bg-paper-recessed/60 px-7 py-4">
          <div className="min-w-0">
            <p className="truncate font-corpus text-[17px] text-ink italic">
              {passage.workTitle}
            </p>
            <p className="mt-0.5 flex items-baseline gap-2 text-[11px]">
              <span className="font-medium tracking-[0.08em] text-ink-muted uppercase">
                {displayAuthor(passage.author)}
              </span>
              <span className="rounded-full bg-verdigris-wash px-2 py-0.5 font-mono text-[10px] text-verdigris">
                §{passage.ordinal}
              </span>
              {passage.heading && (
                <span className="truncate text-ink-faint">{passage.heading}</span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close passage"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-paper hover:text-ink"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto px-8 py-6">
          {reflowSource(passage.text).map((para, i) => (
            <p
              key={i}
              className="mb-4 font-corpus text-[16.5px] leading-[1.85] text-ink last:mb-0"
            >
              <SourceLine text={para} />
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
