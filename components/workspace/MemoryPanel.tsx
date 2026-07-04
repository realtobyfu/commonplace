"use client";

/**
 * The memory panel (§13.2) — the signature surface. Budget meter, cards in
 * three visual states with a kebab menu for pin/evict/hydrate, and the op
 * feed. When nothing has been hydrated yet it shows the §13.4 ghost-card
 * empty state. Card state transitions carry duration classes so the P7
 * condense/unfold choreography lands on this same markup; reduced motion is
 * handled globally (app/globals.css).
 */

export interface WorkingMemoryCard {
  id: string;
  itemType: string;
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
  onOp: (
    op: "pin" | "unpin" | "evict" | "hydrate",
    itemType: string,
    itemId: string,
  ) => void;
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}

/** Render *emphasis* in op reasons as italics — reasons name works/cards. */
function Emphasized({ text }: { text: string }) {
  const parts = text.split(/\*([^*]+)\*/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <em key={i} className="font-[family-name:var(--font-corpus)]">
            {part}
          </em>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function GhostCards() {
  return (
    <div className="space-y-3 pt-1">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-16 rounded-sm border border-dashed border-structure-strong bg-ink/[0.025]"
          style={{ opacity: 0.85 - i * 0.2 }}
        />
      ))}
      <p className="pt-2 text-xs leading-relaxed text-ink/45">
        Concepts appear here as the model reads.
      </p>
    </div>
  );
}

function Card({
  card,
  onOp,
}: {
  card: WorkingMemoryCard;
  onOp: MemoryPanelProps["onOp"];
}) {
  const isCompressed = card.state === "compressed";
  const isPinned = card.state === "pinned";

  return (
    <div
      className={`group rounded-sm border px-3.5 py-3 shadow-[0_1px_0_0_rgba(31,35,40,0.03)] transition-all duration-300 ease-out ${
        isCompressed
          ? "border-structure bg-transparent opacity-55"
          : isPinned
            ? "border-pin-amber/35 bg-white"
            : "border-structure-strong bg-white"
      }`}
      style={{ maxHeight: isCompressed ? "2.25rem" : "6rem", overflow: "hidden" }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate font-[family-name:var(--font-corpus)] text-[15px] text-ink">
          {isPinned && (
            <span className="mr-1.5 text-pin-amber" aria-label="Pinned">
              ▪
            </span>
          )}
          {card.title}
        </p>
        <span className="flex shrink-0 items-center gap-2">
          {!isCompressed && card.passageCount > 0 && (
            <span className="rounded-full bg-verdigris-wash px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[10px] text-verdigris">
              {card.passageCount}p
            </span>
          )}
          <span className="hidden gap-2 group-hover:flex">
            {isPinned ? (
              <button
                type="button"
                onClick={() => onOp("unpin", card.itemType, card.id)}
                className="text-[10px] text-ink/50 hover:text-ink"
              >
                unpin
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onOp("pin", card.itemType, card.id)}
                className="text-[10px] text-ink/50 hover:text-pin-amber"
              >
                pin
              </button>
            )}
            {isCompressed ? (
              <button
                type="button"
                onClick={() => onOp("hydrate", card.itemType, card.id)}
                className="text-[10px] text-ink/50 hover:text-verdigris"
              >
                hydrate
              </button>
            ) : (
              !isPinned && (
                <button
                  type="button"
                  onClick={() => onOp("evict", card.itemType, card.id)}
                  className="text-[10px] text-ink/50 hover:text-ink"
                >
                  compress
                </button>
              )
            )}
          </span>
        </span>
      </div>
    </div>
  );
}

export function MemoryPanel({ cards, budget, recentOps, onOp }: MemoryPanelProps) {
  const pct = Math.min(100, Math.round((budget.used / budget.total) * 100));
  const ordered = [...cards].sort((a, b) => {
    const rank = (c: WorkingMemoryCard) =>
      c.state === "pinned" ? 0 : c.state === "hydrated" ? 1 : 2;
    return rank(a) - rank(b);
  });

  return (
    <aside className="flex w-[340px] shrink-0 flex-col border-l border-structure-strong bg-paper-recessed">
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-semibold tracking-[0.08em] text-ink/60 uppercase">
            Working memory
          </h2>
          <span className="font-[family-name:var(--font-mono)] text-[10px] text-ink/35">
            {pct}%
          </span>
        </div>
        <div
          className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-structure-strong/60"
          title={`${budget.used.toLocaleString()} / ${budget.total.toLocaleString()} tokens`}
        >
          <div
            className="h-full min-w-[3px] rounded-full bg-verdigris transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-1.5 font-[family-name:var(--font-mono)] text-[10px] text-ink/30 transition-colors hover:text-ink/55">
          {budget.used.toLocaleString()} / {budget.total.toLocaleString()} tokens
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-5">
        {ordered.length === 0 ? (
          <GhostCards />
        ) : (
          <div className="space-y-2.5">
            {ordered.map((c) => (
              <Card key={`${c.itemType}:${c.id}`} card={c} onOp={onOp} />
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-structure-strong px-5 py-4">
        {recentOps.length === 0 ? (
          <p className="text-xs leading-relaxed text-ink/45">
            No memory has moved yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {recentOps.map((op, i) => (
              <li
                key={`${op.createdAt}-${i}`}
                className="flex items-baseline justify-between gap-3 text-xs text-ink/65"
              >
                <span className="truncate">
                  <Emphasized text={op.reason} />
                </span>
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
