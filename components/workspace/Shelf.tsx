"use client";

import Link from "next/link";
import { useState } from "react";
import type { ShelfWork } from "@/lib/workspace/state";

/**
 * The corpus shelf (§13.1, §13.3): everything that exists but isn't loaded.
 * Collapsible — the only one of the three surfaces that is. Status per work
 * is shown as quiet text, never as raw Temporal/job language. Sits on the
 * recessed panel tone — "furniture" flanking the conversation "page."
 */

interface ShelfProps {
  works: ShelfWork[];
  workLabel: string; // pack vocabulary — never hardcode "Work"/"Proposal" here
  /** Click an ingested work → open its section reader (WorkOverlay). */
  onOpenWork: (work: ShelfWork) => void;
}

function statusWord(status: string): string {
  switch (status) {
    case "ingested":
      return "on the shelf";
    case "chunking":
      return "opening";
    case "summarizing":
      return "reading";
    case "embedding":
      return "indexing";
    case "failed":
      return "stalled";
    default:
      return "unopened";
  }
}

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {direction === "left" ? <path d="m15 6-6 6 6 6" /> : <path d="m9 6 6 6-6 6" />}
    </svg>
  );
}

/** A quiet status dot — filled and verdigris while actively being read. */
function StatusDot({ status }: { status: string }) {
  const active = status !== "ingested" && status !== "pending";
  if (active) {
    return (
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-verdigris/50" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-verdigris" />
      </span>
    );
  }
  if (status === "ingested") {
    return <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink-faint" />;
  }
  return (
    <span className="h-1.5 w-1.5 shrink-0 rounded-full border border-ink-faint" />
  );
}

export function Shelf({ works, workLabel, onOpenWork }: ShelfProps) {
  const [collapsed, setCollapsed] = useState(false);

  const byAuthor = new Map<string, ShelfWork[]>();
  for (const w of works) {
    byAuthor.set(w.author, [...(byAuthor.get(w.author) ?? []), w]);
  }

  if (collapsed) {
    return (
      <aside className="flex w-10 shrink-0 flex-col items-center border-r border-structure-strong bg-paper-recessed py-3">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Expand shelf"
          className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-paper hover:text-ink"
        >
          <Chevron direction="right" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex w-[260px] shrink-0 flex-col border-r border-structure-strong bg-paper-recessed">
      <Link
        href="/"
        className="px-5 pt-4 font-mono text-[10px] font-medium tracking-[0.14em] text-ink-faint uppercase transition-colors hover:text-ink"
      >
        Commonplace
      </Link>
      <div className="flex items-center justify-between px-5 pt-3 pb-3">
        <h2 className="text-xs font-semibold tracking-[0.08em] text-ink-muted uppercase">
          Shelf
        </h2>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label="Collapse shelf"
          className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-paper hover:text-ink"
        >
          <Chevron direction="left" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 pb-5">
        <ul className="space-y-5">
          {[...byAuthor.entries()].map(([author, authorWorks]) => (
            <li key={author}>
              <p className="border-b border-structure-strong pb-1 text-[11px] font-semibold tracking-[0.1em] text-ink-muted uppercase">
                {author}
              </p>
              <ul className="mt-2 space-y-0.5">
                {authorWorks.map((w) => {
                  const active = w.status !== "ingested" && w.status !== "pending";
                  const draggable = w.status === "ingested";
                  return (
                    <li
                      key={w.id}
                      draggable={draggable}
                      onDragStart={(e) => {
                        // drag a work onto the memory panel → hydrate (§13.2)
                        e.dataTransfer.setData(
                          "application/json",
                          JSON.stringify({ itemType: "work_summary", itemId: w.id }),
                        );
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      title={`${workLabel}: ${w.title} — ${statusWord(w.status)}${
                        draggable
                          ? " · click to read · drag into working memory"
                          : ""
                      }`}
                      className={`group flex items-center gap-2 rounded px-1.5 -mx-1.5 py-1 font-corpus text-[15px] transition-colors ${
                        active
                          ? "bg-verdigris-wash"
                          : draggable
                            ? "cursor-grab hover:bg-paper"
                            : ""
                      }`}
                    >
                      <StatusDot status={w.status} />
                      {draggable ? (
                        /* ingested → click opens the work's section reader */
                        <button
                          type="button"
                          onClick={() => onOpenWork(w)}
                          className="min-w-0 flex-1 cursor-pointer truncate text-left text-ink hover:text-verdigris-deep hover:underline hover:decoration-structure-strong hover:underline-offset-2"
                        >
                          {w.title}
                        </button>
                      ) : (
                        <span
                          className={
                            active
                              ? "min-w-0 flex-1 truncate text-ink"
                              : "min-w-0 flex-1 truncate text-ink-faint"
                          }
                        >
                          {w.title}
                        </span>
                      )}
                      {active && (
                        <span className="ml-auto shrink-0 font-mono text-[10px] text-verdigris">
                          {statusWord(w.status)}
                        </span>
                      )}
                      {draggable && (
                        /* grip dots — hints the row can be picked up */
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          aria-hidden="true"
                          className="ml-auto shrink-0 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          <circle cx="9" cy="6" r="1.7" />
                          <circle cx="15" cy="6" r="1.7" />
                          <circle cx="9" cy="12" r="1.7" />
                          <circle cx="15" cy="12" r="1.7" />
                          <circle cx="9" cy="18" r="1.7" />
                          <circle cx="15" cy="18" r="1.7" />
                        </svg>
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
