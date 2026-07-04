"use client";

/**
 * The memory panel (§13.2) — the signature surface. Budget meter, cards in
 * three visual states, and the op feed. When nothing has been hydrated yet
 * it shows the §13.4 ghost-card empty state rather than an empty box.
 *
 * Card states carry transition classes now so that when P6/P7 wire live
 * hydrate/evict ops, the condense/unfold motion just works — reduced motion
 * is handled globally (see app/globals.css).
 */

export interface WorkingMemoryCard {
  id: string;
  title: string;
  state: "pinned" | "hydrated" | "compressed";
  passageCount: number;
  tokenCost: number;
}

interface RecentOp {
  op: string;
  reason: string;
  createdAt: string;
}

interface MemoryPanelProps {
  cards: WorkingMemoryCard[];
  budget: { used: number; total: number };
  recentOps: RecentOp[];
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}

function GhostCards() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-16 rounded-sm border border-dashed border-structure"
          style={{ opacity: 0.5 - i * 0.1 }}
        />
      ))}
      <p className="pt-1 text-xs leading-relaxed text-ink/40">
        Concepts appear here as the model reads.
      </p>
    </div>
  );
}

function Card({ card }: { card: WorkingMemoryCard }) {
  const isCompressed = card.state === "compressed";
  return (
    <div
      className={`rounded-sm border border-structure px-3 py-2.5 transition-all duration-300 ease-out ${
        isCompressed ? "opacity-50" : "opacity-100"
      }`}
      style={{ maxHeight: isCompressed ? "2.5rem" : "6rem", overflow: "hidden" }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-[family-name:var(--font-corpus)] text-sm text-ink">
          {card.state === "pinned" && (
            <span className="mr-1.5 text-pin-amber" aria-label="Pinned">
              ▪
            </span>
          )}
          {card.title}
        </p>
        {!isCompressed && (
          <span className="shrink-0 font-[family-name:var(--font-mono)] text-[10px] text-ink/40">
            {card.passageCount}p
          </span>
        )}
      </div>
    </div>
  );
}

export function MemoryPanel({ cards, budget, recentOps }: MemoryPanelProps) {
  const pct = Math.min(100, Math.round((budget.used / budget.total) * 100));

  return (
    <aside className="flex w-[340px] shrink-0 flex-col border-l border-structure">
      <div className="px-5 pt-5 pb-4">
        <h2 className="text-xs font-medium uppercase tracking-wide text-ink/50">
          Working memory
        </h2>
        <div
          className="mt-3 h-1 w-full overflow-hidden rounded-full bg-structure"
          title={`${budget.used.toLocaleString()} / ${budget.total.toLocaleString()} tokens`}
        >
          <div
            className="h-full bg-verdigris transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-1 font-[family-name:var(--font-mono)] text-[10px] text-ink/0 transition-colors hover:text-ink/40">
          {budget.used.toLocaleString()} / {budget.total.toLocaleString()} tokens
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-5">
        {cards.length === 0 ? (
          <GhostCards />
        ) : (
          <div className="space-y-2.5">
            {cards.map((c) => (
              <Card key={c.id} card={c} />
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-structure px-5 py-4">
        {recentOps.length === 0 ? (
          <p className="text-xs leading-relaxed text-ink/40">
            No memory has moved yet.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {recentOps.map((op, i) => (
              <li
                key={`${op.createdAt}-${i}`}
                className="flex items-baseline justify-between gap-3 text-xs text-ink/60"
              >
                <span className="truncate">{op.reason}</span>
                <span className="shrink-0 font-[family-name:var(--font-mono)] text-[10px] text-ink/35">
                  {formatRelativeTime(op.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
