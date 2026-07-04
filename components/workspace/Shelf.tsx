"use client";

import { useState } from "react";
import type { ShelfWork } from "@/lib/workspace/state";

/**
 * The corpus shelf (§13.1, §13.3): everything that exists but isn't loaded.
 * Collapsible — the only one of the three surfaces that is. Status per work
 * is shown as quiet text, never as raw Temporal/job language.
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

export function Shelf({ works, workLabel }: ShelfProps) {
  const [collapsed, setCollapsed] = useState(false);

  const byAuthor = new Map<string, ShelfWork[]>();
  for (const w of works) {
    byAuthor.set(w.author, [...(byAuthor.get(w.author) ?? []), w]);
  }

  if (collapsed) {
    return (
      <aside className="flex w-10 flex-col items-center border-r border-structure py-4">
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
    <aside className="flex w-[260px] shrink-0 flex-col border-r border-structure">
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <h2 className="text-xs font-medium uppercase tracking-wide text-ink/50">
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
        <ul className="space-y-4">
          {[...byAuthor.entries()].map(([author, authorWorks]) => (
            <li key={author}>
              <p className="text-xs uppercase tracking-wide text-ink/40">
                {author}
              </p>
              <ul className="mt-1.5 space-y-1.5">
                {authorWorks.map((w) => (
                  <li
                    key={w.id}
                    draggable={w.status === "ingested"}
                    title={`${workLabel}: ${w.title} — ${statusWord(w.status)}`}
                    className="group flex items-baseline justify-between gap-2 font-[family-name:var(--font-corpus)] text-sm"
                  >
                    <span
                      className={
                        w.status === "ingested"
                          ? "text-ink cursor-grab"
                          : "text-ink/35"
                      }
                    >
                      {w.title}
                    </span>
                    {w.status !== "ingested" && w.status !== "pending" && (
                      <span className="shrink-0 font-[family-name:var(--font-mono)] text-[10px] text-verdigris">
                        {statusWord(w.status)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
