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
      className="fixed inset-0 z-30 flex items-center justify-center bg-ink/20 p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${passage.workTitle}, passage ${passage.ordinal}`}
    >
      <div
        className="flex max-h-[70vh] w-full max-w-xl flex-col border border-structure-strong bg-paper shadow-[0_2px_16px_rgba(31,35,40,0.08)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between border-b border-structure px-6 py-4">
          <p className="font-[family-name:var(--font-mono)] text-[11px] text-ink/55">
            {passage.author} · {passage.workTitle} §{passage.ordinal}
            {passage.heading ? ` · ${passage.heading}` : ""}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close passage"
            className="text-ink/40 hover:text-ink"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">
          <p className="font-[family-name:var(--font-corpus)] text-[16px] leading-[1.8] whitespace-pre-wrap text-ink">
            {passage.text}
          </p>
        </div>
      </div>
    </div>
  );
}
