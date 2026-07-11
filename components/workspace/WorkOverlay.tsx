"use client";

import { useEffect, useState } from "react";
import { RichText } from "./RichText";
import { displayAuthor } from "./PassageOverlay";
import { stripSummaryPreamble } from "@/lib/workspace/summaryText";

/**
 * The reader a shelf work opens (§13.3 drill-down, work-level): the model's
 * per-section summaries as a browsable table of contents. Each section row
 * opens the exact passage text in the PassageOverlay above this sheet —
 * summary as the map, source as the territory. Escape or the scrim closes.
 */

interface WorkSection {
  passageId: string;
  ordinal: number;
  heading: string | null;
  workTitle: string;
  author: string;
  text: string;
}

export function WorkOverlay({
  workId,
  title,
  author,
  onClose,
  onOpenPassage,
}: {
  workId: string;
  title: string;
  author: string;
  onClose: () => void;
  onOpenPassage: (passageId: string) => void;
}) {
  const [sections, setSections] = useState<WorkSection[] | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/items/work_summary/${workId}/passages`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { items: WorkSection[] } | null) => {
        if (!cancelled) setSections(data?.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setSections([]);
      });
    return () => {
      cancelled = true;
    };
  }, [workId]);

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-ink/25 p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${title} — sections`}
    >
      <div
        className="flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-structure-strong bg-paper shadow-[0_8px_40px_rgba(22,25,29,0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-structure bg-paper-recessed/60 px-7 py-4">
          <div className="min-w-0">
            <p className="truncate font-corpus text-[17px] text-ink italic">
              {title}
            </p>
            <p className="mt-0.5 flex items-baseline gap-2 text-[11px]">
              <span className="font-medium tracking-[0.08em] text-ink-muted uppercase">
                {displayAuthor(author)}
              </span>
              {sections !== null && sections.length > 0 && (
                <span className="font-mono text-[10px] text-ink-faint">
                  {sections.length} sections
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close work"
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
        <div className="overflow-y-auto px-4 py-3">
          {sections === null ? (
            <p className="px-3 py-4 text-sm text-ink-muted">Opening…</p>
          ) : sections.length === 0 ? (
            <p className="px-3 py-4 text-sm text-ink-muted">
              This work hasn&apos;t been summarized yet — its sections appear
              here once reading finishes.
            </p>
          ) : (
            <ul>
              {sections.map((s) => (
                <li key={s.passageId}>
                  <button
                    type="button"
                    onClick={() => onOpenPassage(s.passageId)}
                    title="Open the exact passage"
                    className="group flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-paper-recessed"
                  >
                    <span className="mt-0.5 shrink-0 font-mono text-[11px] text-verdigris">
                      §{s.ordinal}
                    </span>
                    <span className="min-w-0 flex-1">
                      {s.heading && (
                        <span className="mb-0.5 block text-[12px] font-semibold text-ink">
                          {s.heading}
                        </span>
                      )}
                      <RichText
                        text={stripSummaryPreamble(s.text)}
                        className="font-corpus text-[14px] leading-relaxed text-ink-muted [&_p]:my-0"
                      />
                    </span>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      aria-hidden="true"
                      className="mt-1 shrink-0 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
