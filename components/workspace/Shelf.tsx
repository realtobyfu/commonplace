"use client";

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
    return <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink/25" />;
  }
  return (
    <span className="h-1.5 w-1.5 shrink-0 rounded-full border border-ink/20" />
  );
}

export function Shelf({ works, workLabel }: ShelfProps) {
  const [collapsed, setCollapsed] = useState(false);

  const byAuthor = new Map<string, ShelfWork[]>();
  for (const w of works) {
    byAuthor.set(w.author, [...(byAuthor.get(w.author) ?? []), w]);
  }

  if (collapsed) {
    return (
      <aside className="flex w-10 shrink-0 flex-col items-center border-r border-structure-strong bg-paper-recessed py-4">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Expand shelf"
          className="text-ink/50 hover:text-ink"
        >
          ›
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex w-[260px] shrink-0 flex-col border-r border-structure-strong bg-paper-recessed">
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <h2 className="text-xs font-semibold tracking-[0.08em] text-ink/60 uppercase">
          Shelf
        </h2>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label="Collapse shelf"
          className="text-ink/40 hover:text-ink"
        >
          ‹
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 pb-5">
        <ul className="space-y-5">
          {[...byAuthor.entries()].map(([author, authorWorks]) => (
            <li key={author}>
              <p className="border-b border-structure-strong pb-1 text-[11px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                {author}
              </p>
              <ul className="mt-2 space-y-0.5">
                {authorWorks.map((w) => {
                  const active = w.status !== "ingested" && w.status !== "pending";
                  return (
                    <li
                      key={w.id}
                      draggable={w.status === "ingested"}
                      onDragStart={(e) => {
                        // drag a work onto the memory panel → hydrate (§13.2)
                        e.dataTransfer.setData(
                          "application/json",
                          JSON.stringify({ itemType: "work_summary", itemId: w.id }),
                        );
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      title={`${workLabel}: ${w.title} — ${statusWord(w.status)}`}
                      className={`group flex items-center gap-2 rounded-sm px-1.5 -mx-1.5 py-1 font-[family-name:var(--font-corpus)] text-[15px] ${
                        active ? "bg-verdigris-wash" : ""
                      }`}
                    >
                      <StatusDot status={w.status} />
                      <span
                        className={
                          w.status === "ingested"
                            ? "cursor-grab text-ink"
                            : active
                              ? "text-ink/80"
                              : "text-ink/40"
                        }
                      >
                        {w.title}
                      </span>
                      {active && (
                        <span className="ml-auto shrink-0 font-[family-name:var(--font-mono)] text-[10px] text-verdigris">
                          {statusWord(w.status)}
                        </span>
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
