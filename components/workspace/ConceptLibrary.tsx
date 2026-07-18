"use client";

import { useEffect, useMemo, useState } from "react";
import { RichText } from "./RichText";
import { stripSummaryPreamble } from "@/lib/workspace/summaryText";

interface ConceptCardData {
  id: string;
  title: string;
  body: string;
  authorScope: string[];
  passageCount: number;
}

interface WorkingItem {
  itemType: string;
  itemId: string;
  state: string;
  pinned: boolean;
}

interface Passage {
  passageId: string;
  ordinal: number;
  workTitle: string;
  author: string;
  text: string;
}

export function ConceptLibrary({
  workspaceId,
  workingSet,
  onClose,
  onOp,
  onOpenPassage,
}: {
  workspaceId: string;
  workingSet: WorkingItem[];
  onClose: () => void;
  onOp: (op: "pin" | "unpin" | "evict" | "hydrate", itemType: string, itemId: string) => void;
  onOpenPassage: (passageId: string) => void;
}) {
  const [cards, setCards] = useState<ConceptCardData[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/w/${workspaceId}/concepts`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { cards: ConceptCardData[] } | null) => {
        if (!cancelled) setCards(data?.cards ?? []);
      })
      .catch(() => {
        if (!cancelled) setCards([]);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return cards ?? [];
    return (cards ?? []).filter((card) =>
      [card.title, card.body, ...card.authorScope].join(" ").toLowerCase().includes(needle),
    );
  }, [cards, query]);

  return (
    <div className="absolute inset-0 flex flex-col bg-paper-recessed">
      <div className="border-b border-structure-strong px-5 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xs font-semibold tracking-[0.08em] text-ink/60 uppercase">
              Concept library
            </h2>
            <p className="mt-1 text-xs text-ink-muted">On the shelf, not necessarily in memory.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close concept library" className="text-ink/40 hover:text-ink">
            ✕
          </button>
        </div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search concepts or thinkers"
          className="mt-3 w-full rounded-md border border-structure-strong bg-white px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-verdigris"
        />
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {cards === null ? (
          <p className="text-xs text-ink-faint">Opening the library…</p>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-ink-muted">No concept cards match that search.</p>
        ) : (
          <div className="space-y-3">
            {filtered.map((card) => (
              <LibraryCard
                key={card.id}
                card={card}
                memory={workingSet.find((item) => item.itemType === "card" && item.itemId === card.id)}
                onOp={onOp}
                onOpenPassage={onOpenPassage}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LibraryCard({
  card,
  memory,
  onOp,
  onOpenPassage,
}: {
  card: ConceptCardData;
  memory: WorkingItem | undefined;
  onOp: (op: "pin" | "unpin" | "evict" | "hydrate", itemType: string, itemId: string) => void;
  onOpenPassage: (passageId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [passages, setPassages] = useState<Passage[] | null>(null);
  useEffect(() => {
    if (!expanded || passages !== null) return;
    fetch(`/api/items/card/${card.id}/passages`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { items: Passage[] } | null) => setPassages(data?.items ?? []))
      .catch(() => setPassages([]));
  }, [card.id, expanded, passages]);

  const state = memory?.pinned ? "Pinned" : memory?.state === "hydrated" ? "In memory" : memory ? "Compressed" : "On shelf";
  const hydrate = !memory || memory.state === "compressed";
  return (
    <article className="rounded-lg border border-structure-strong bg-white p-3 shadow-sm">
      <button type="button" onClick={() => setExpanded((value) => !value)} className="w-full text-left">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-corpus text-[16px] leading-snug text-ink">{card.title}</h3>
          <span className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[9px] ${memory ? "bg-verdigris-wash text-verdigris" : "bg-paper-recessed text-ink-faint"}`}>
            {state}
          </span>
        </div>
        <p className="mt-1 font-mono text-[10px] text-ink-faint">
          {card.authorScope.join(" · ")} · {card.passageCount} passages
        </p>
      </button>
      {expanded && (
        <div className="mt-3 border-t border-structure pt-3">
          <RichText text={stripSummaryPreamble(card.body)} className="font-corpus text-[13px] leading-relaxed text-ink-muted" />
          <div className="mt-3 flex flex-wrap gap-2">
            {hydrate && <button type="button" onClick={() => onOp("hydrate", "card", card.id)} className="btn-ghost">hydrate</button>}
            {memory?.pinned ? (
              <button type="button" onClick={() => onOp("unpin", "card", card.id)} className="btn-ghost">unpin</button>
            ) : memory ? (
              <button type="button" onClick={() => onOp("pin", "card", card.id)} className="btn-ghost">pin</button>
            ) : null}
          </div>
          <div className="mt-3 border-t border-structure pt-2">
            <p className="font-mono text-[9px] tracking-wide text-ink-faint uppercase">Supporting passages</p>
            {passages === null ? <p className="mt-1 text-xs text-ink-faint">Loading evidence…</p> : (
              <ul className="mt-1 space-y-1">
                {passages.map((passage) => (
                  <li key={passage.passageId}>
                    <button type="button" onClick={() => onOpenPassage(passage.passageId)} className="w-full rounded px-1 py-1 text-left hover:bg-paper-recessed">
                      <span className="font-mono text-[10px] text-verdigris">§{passage.ordinal} </span>
                      <span className="font-corpus text-xs text-ink-muted">{stripSummaryPreamble(passage.text).slice(0, 120)}…</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
