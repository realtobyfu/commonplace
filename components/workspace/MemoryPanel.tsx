"use client";

import { useEffect, useState } from "react";
import { RichText } from "@/components/workspace/RichText";
import { stripSummaryPreamble } from "@/lib/workspace/summaryText";

/**
 * The memory panel (§13.2) — the signature surface. Budget meter, cards in
 * three visual states, drill-down (card → underlying passages → exact text),
 * the op feed, and the condense/unfold choreography: hydration unfolds a
 * card over ~400ms, eviction condenses it on the same curve, and a
 * simultaneous swap reads as one motion. Drop target for drag-from-shelf.
 * Reduced motion falls back to a crossfade (global rule in globals.css).
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

interface DrillPassage {
  passageId: string;
  ordinal: number;
  heading: string | null;
  workTitle: string;
  author: string;
  text: string;
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
  onOpenSettings: () => void;
  onOpenTimeline: () => void;
  /** Set briefly when a provenance chip names a card in the working set. */
  flashItemId: string | null;
}

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

// Mirrors RichText's citation-token shapes (§13.3) so one-line previews can
// strip [[p:UUID]] / [[p:UUID]§0] / 【p:30】 without pulling in the full
// block renderer for a single truncated line.
const CITE_STRIP_RE =
  /\[\[(?:p:)?[^[\]]{1,60}\](?:§\d+)?\]|【\s*p:[^】]{0,40}】/gi;

/** Plain-text preview: scaffolding preamble out, citation tokens out,
 *  markdown syntax chars out. */
function previewText(text: string): string {
  return stripSummaryPreamble(text)
    .replace(CITE_STRIP_RE, "")
    .replace(/[`*_#]|^>\s?/gm, "")
    .replace(/\s+/g, " ")
    .trim();
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
          <em key={i} className="font-corpus">
            {part}
          </em>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

/** 12px stroke icon wrapper — card ops and affordance chevrons share it. */
function Icon({
  size = 12,
  className,
  children,
}: {
  size?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

function PinGlyph({ filled = false }: { filled?: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M6 3h12v18l-6-4.5L6 21z" />
    </svg>
  );
}

function GhostCards() {
  return (
    <div className="space-y-3 pt-1">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-16 rounded-lg border border-dashed border-structure-strong bg-ink/[0.025]"
          style={{ opacity: 0.85 - i * 0.2 }}
        />
      ))}
      <p className="pt-2 text-xs leading-relaxed text-ink-muted">
        Concepts appear here as the model reads.
      </p>
    </div>
  );
}

function Card({
  card,
  isNew,
  flashing,
  expanded,
  onToggleExpand,
  onOp,
}: {
  card: WorkingMemoryCard;
  isNew: boolean;
  flashing: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onOp: MemoryPanelProps["onOp"];
}) {
  const isCompressed = card.state === "compressed";
  const isPinned = card.state === "pinned";
  const [passages, setPassages] = useState<DrillPassage[] | null>(null);
  const [openPassage, setOpenPassage] = useState<string | null>(null);

  useEffect(() => {
    if (!expanded || passages !== null) return;
    let cancelled = false;
    fetch(`/api/items/${card.itemType}/${card.id}/passages`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { items: DrillPassage[] } | null) => {
        if (!cancelled && data) setPassages(data.items);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [expanded, passages, card.itemType, card.id]);

  // Compressed collapses to a single row; hydrated/pinned carry a second
  // row (count + ops), so the collapsed clip is taller.
  const maxHeight = expanded ? "26rem" : isCompressed ? "2.75rem" : "6rem";

  // Ops are ALWAYS rendered (discoverable without hovering), just subdued
  // until the card is hovered or focused.
  const opsClass =
    "flex shrink-0 items-center gap-1 opacity-60 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100";

  const pinOp = isPinned ? (
    <button
      type="button"
      onClick={() => onOp("unpin", card.itemType, card.id)}
      className="btn-ghost"
    >
      <Icon>
        <path d="M6 3h12v18l-6-4.5L6 21z" />
        <path d="M4 4l16 16" />
      </Icon>
      unpin
    </button>
  ) : (
    <button
      type="button"
      onClick={() => onOp("pin", card.itemType, card.id)}
      className="btn-ghost hover:text-pin-amber"
    >
      <Icon>
        <path d="M6 3h12v18l-6-4.5L6 21z" />
      </Icon>
      pin
    </button>
  );

  const stateOp = isCompressed ? (
    <button
      type="button"
      onClick={() => onOp("hydrate", card.itemType, card.id)}
      className="btn-ghost hover:text-verdigris"
    >
      <Icon>
        {/* chevrons-out — the card re-expands into the working set */}
        <path d="m7 15 5 5 5-5" />
        <path d="m7 9 5-5 5 5" />
      </Icon>
      hydrate
    </button>
  ) : !isPinned ? (
    <button
      type="button"
      onClick={() => onOp("evict", card.itemType, card.id)}
      className="btn-ghost"
    >
      <Icon>
        {/* chevrons-in — the card condenses to a one-line stub */}
        <path d="m7 20 5-5 5 5" />
        <path d="m7 4 5 5 5-5" />
      </Icon>
      compress
    </button>
  ) : null;

  const expandChevron = (
    <Icon
      className={`shrink-0 text-ink-faint transition-transform duration-200 ${
        expanded ? "rotate-180" : ""
      }`}
    >
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );

  return (
    <div
      className={`group border ${
        isCompressed
          ? "rounded-lg border-dashed border-structure bg-transparent opacity-70"
          : isPinned
            ? "rounded-lg border-structure-strong border-l-2 border-l-pin-amber bg-white shadow-sm"
            : "rounded-lg border-structure-strong bg-white shadow-sm"
      } ${flashing ? "ring-2 ring-verdigris" : ""} ${isNew ? "card-unfold" : ""}`}
      style={{
        maxHeight,
        overflow: "hidden",
        transition: `max-height 400ms ${EASE}, opacity 400ms ${EASE}, box-shadow 300ms ease`,
      }}
    >
      {isCompressed ? (
        /* Compressed (§13.2): a one-line stub — reduced, still legible. */
        <div className="flex items-center gap-1.5 px-3.5 py-2">
          <button
            type="button"
            onClick={onToggleExpand}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
            title={expanded ? "Collapse" : "Show the passages underneath"}
            aria-expanded={expanded}
          >
            <span className="min-w-0 flex-1 truncate font-corpus text-[15px] text-ink-muted">
              {card.title}
            </span>
            {expandChevron}
          </button>
          <span className={opsClass}>
            {pinOp}
            {stateOp}
          </span>
        </div>
      ) : (
        /* Hydrated / pinned (§13.2): title row + count-and-ops row. */
        <div className="px-3.5 pt-2.5 pb-2">
          <button
            type="button"
            onClick={onToggleExpand}
            className="flex w-full items-center gap-1.5 text-left"
            title={expanded ? "Collapse" : "Show the passages underneath"}
            aria-expanded={expanded}
          >
            {isPinned && (
              <span className="shrink-0 text-pin-amber" aria-label="Pinned">
                <PinGlyph filled />
              </span>
            )}
            <span className="min-w-0 flex-1 truncate font-corpus text-[15px] text-ink">
              {card.title}
            </span>
            {expandChevron}
          </button>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {card.passageCount > 0 && (
              <span
                className="font-mono text-[10px] text-ink-faint"
                title={`≈${card.tokenCost.toLocaleString()} tokens in context`}
              >
                {card.passageCount} passage{card.passageCount === 1 ? "" : "s"}
              </span>
            )}
            <span className={`ml-auto ${opsClass}`}>
              {pinOp}
              {stateOp}
            </span>
          </div>
        </div>
      )}

      {expanded && (
        <div className="max-h-[21rem] overflow-y-auto border-t border-structure px-3.5 py-2.5">
          {passages === null ? (
            <p className="text-xs text-ink-faint">Opening…</p>
          ) : openPassage !== null ? (
            (() => {
              const p = passages.find((x) => x.passageId === openPassage);
              if (!p) return null;
              return (
                <div>
                  <button
                    type="button"
                    onClick={() => setOpenPassage(null)}
                    className="btn-ghost -ml-1.5"
                  >
                    <Icon>
                      <path d="m15 6-6 6 6 6" />
                    </Icon>
                    passages
                  </button>
                  <p className="mt-1.5 font-mono text-[10px] text-ink-faint">
                    {p.workTitle} §{p.ordinal}
                    {p.heading ? ` · ${p.heading}` : ""}
                  </p>
                  <RichText
                    text={stripSummaryPreamble(p.text)}
                    className="mt-2 font-corpus text-[13.5px] leading-relaxed text-ink"
                  />
                </div>
              );
            })()
          ) : (
            <ul className="space-y-0.5">
              {passages.map((p) => (
                <li key={p.passageId}>
                  <button
                    type="button"
                    onClick={() => setOpenPassage(p.passageId)}
                    className="-mx-1.5 flex w-[calc(100%+0.75rem)] items-start gap-2 rounded px-1.5 py-1.5 text-left transition-colors hover:bg-paper-recessed"
                  >
                    <span className="shrink-0 pt-px font-mono text-[10px] text-verdigris">
                      §{p.ordinal}
                    </span>
                    <span className="line-clamp-2 min-w-0 flex-1 font-corpus text-[13px] leading-snug text-ink-muted">
                      {previewText(p.text)}
                    </span>
                    <Icon className="mt-0.5 shrink-0 text-ink-faint">
                      <path d="m9 6 6 6-6 6" />
                    </Icon>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function MemoryPanel({
  cards,
  budget,
  recentOps,
  onOp,
  onOpenSettings,
  onOpenTimeline,
  flashItemId,
}: MemoryPanelProps) {
  const pct = Math.min(100, Math.round((budget.used / budget.total) * 100));
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Track which keys were present before this render so a newly hydrated
  // card plays the unfold entrance exactly once. Uses React's sanctioned
  // adjust-state-during-render pattern (no refs read in render); `fresh`
  // persists as state until the next membership change, so the 400ms
  // animation isn't cut short by re-renders.
  const [keyState, setKeyState] = useState<{ known: string; fresh: Set<string> }>(
    () => ({
      known: cards.map((c) => `${c.itemType}:${c.id}`).sort().join("|"),
      fresh: new Set<string>(),
    }),
  );
  const currentKnown = cards.map((c) => `${c.itemType}:${c.id}`).sort().join("|");
  if (currentKnown !== keyState.known) {
    const previous = new Set(keyState.known.split("|"));
    setKeyState({
      known: currentKnown,
      fresh: new Set(
        cards
          .map((c) => `${c.itemType}:${c.id}`)
          .filter((k) => !previous.has(k)),
      ),
    });
  }
  const newKeys = keyState.fresh;

  const ordered = [...cards].sort((a, b) => {
    const rank = (c: WorkingMemoryCard) =>
      c.state === "pinned" ? 0 : c.state === "hydrated" ? 1 : 2;
    return rank(a) - rank(b);
  });

  return (
    <aside
      className={`relative flex w-[340px] shrink-0 flex-col border-l border-structure-strong bg-paper-recessed transition-colors ${
        dragOver ? "bg-verdigris-wash" : ""
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        try {
          const data = JSON.parse(e.dataTransfer.getData("application/json")) as {
            itemType?: string;
            itemId?: string;
          };
          if (data.itemType && data.itemId) {
            onOp("hydrate", data.itemType, data.itemId);
          }
        } catch {
          // not one of ours
        }
      }}
    >
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold tracking-[0.08em] text-ink-muted uppercase">
            Working memory
          </h2>
          <span className="flex items-center gap-1">
            <span className="mr-1 font-mono text-[11px] font-medium text-ink-muted">
              {pct}%
            </span>
            <button
              type="button"
              onClick={onOpenTimeline}
              aria-label="Activity timeline"
              title="Activity"
              className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-paper hover:text-ink"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
            </button>
            <button
              type="button"
              onClick={onOpenSettings}
              aria-label="Memory settings"
              className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-paper hover:text-ink"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
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
        <p className="mt-1.5 font-mono text-[10.5px] text-ink-faint">
          {budget.used.toLocaleString()} / {budget.total.toLocaleString()} tokens
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-5">
        {ordered.length === 0 ? (
          <GhostCards />
        ) : (
          <div className="space-y-2.5 pb-4">
            {ordered.map((c) => {
              const key = `${c.itemType}:${c.id}`;
              return (
                <Card
                  key={key}
                  card={c}
                  isNew={newKeys.has(key)}
                  flashing={flashItemId === c.id}
                  expanded={expandedKey === key}
                  onToggleExpand={() =>
                    setExpandedKey((k) => (k === key ? null : key))
                  }
                  onOp={onOp}
                />
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-structure-strong px-5 py-4">
        <p className="mb-2 font-mono text-[10px] tracking-wide text-ink-faint uppercase">
          Recent activity
        </p>
        {recentOps.length === 0 ? (
          <p className="text-xs leading-relaxed text-ink-muted">
            No memory has moved yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {recentOps.map((op, i) => (
              <li
                key={`${op.createdAt}-${i}`}
                className="flex items-baseline justify-between gap-3 text-xs text-ink-muted"
              >
                <span className="truncate">
                  <Emphasized text={op.reason} />
                </span>
                <span className="shrink-0 font-mono text-[10px] text-ink-faint">
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
