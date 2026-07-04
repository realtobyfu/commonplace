"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The conversation surface (§13.3) and empty state (§13.4). Streaming
 * answers with provenance chips clustered at message end; while the router
 * and memory plan run, the composer shows a one-line status in domain
 * language — never "thinking…".
 */

export interface ProvenanceChipData {
  passageId: string;
  author: string;
  workTitle: string;
  ordinal: number;
}

export interface ChatMessage {
  id: string;
  role: string;
  content: string;
  provenance: ProvenanceChipData[];
  streaming: boolean;
}

export interface StarterPrompt {
  prompt: string;
  behavior: string;
}

interface ConversationProps {
  promiseLine: string;
  starterPrompts: StarterPrompt[];
  messages: ChatMessage[];
  ingestionDone: boolean;
  statusLine: string | null;
  busy: boolean;
  onSend: (text: string) => void;
}

const BEHAVIOR_LABEL: Record<string, string> = {
  "cross-thinker": "side-by-side hydration",
  sequential: "cards accumulate",
  "deep-dive": "one work unfolds",
};

/** Render *emphasis* (work titles in status lines / op reasons) as italics. */
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

function ProvenanceChips({ chips }: { chips: ProvenanceChipData[] }) {
  if (chips.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <span
          key={chip.passageId}
          title={`${chip.author}, ${chip.workTitle} §${chip.ordinal}`}
          className="rounded-full border border-verdigris/40 px-2 py-0.5 font-[family-name:var(--font-mono)] text-[10px] text-verdigris"
        >
          {chip.workTitle} §{chip.ordinal}
        </span>
      ))}
    </div>
  );
}

export function Conversation({
  promiseLine,
  starterPrompts,
  messages,
  ingestionDone,
  statusLine,
  busy,
  onSend,
}: ConversationProps) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const canSend = ingestionDone && !busy;
  const submit = () => {
    const text = draft.trim();
    if (!text || !canSend) return;
    onSend(text);
    setDraft("");
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-10 py-12">
        {messages.length === 0 ? (
          <div className="mx-auto max-w-xl text-center">
            <p className="font-[family-name:var(--font-corpus)] text-3xl leading-snug text-ink">
              {promiseLine}
            </p>

            <div className="mt-10 space-y-2 text-left">
              {starterPrompts.length === 0 ? (
                <p className="text-center text-sm leading-relaxed text-ink/40">
                  Starter prompts appear once the shelf finishes filling.
                </p>
              ) : (
                starterPrompts.map((p, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => canSend && onSend(p.prompt)}
                    className="block w-full rounded-sm border border-structure px-4 py-3 text-left transition-colors hover:border-verdigris/50"
                  >
                    <span className="font-[family-name:var(--font-corpus)] text-sm text-ink">
                      {p.prompt}
                    </span>
                    <span className="mt-1 block font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-verdigris/70">
                      {BEHAVIOR_LABEL[p.behavior] ?? p.behavior}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-6">
            {messages.map((m) => (
              <div key={m.id}>
                <p className="text-xs uppercase tracking-wide text-ink/40">
                  {m.role === "user" ? "You" : "Commonplace"}
                </p>
                <p className="mt-1 font-[family-name:var(--font-corpus)] text-base leading-relaxed whitespace-pre-wrap text-ink">
                  {m.content}
                  {m.streaming && m.content === "" && (
                    <span className="text-ink/35">…</span>
                  )}
                </p>
                <ProvenanceChips chips={m.provenance} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-structure px-10 py-5">
        <div className="mx-auto max-w-2xl">
          {statusLine && (
            <p
              className="pb-2 text-xs text-verdigris"
              aria-live="polite"
            >
              <Emphasized text={statusLine} />
            </p>
          )}
          <div className="flex items-center gap-3">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              disabled={!ingestionDone}
              placeholder={
                ingestionDone
                  ? "Ask across the shelf…"
                  : "The shelf is still filling — hang tight."
              }
              className="flex-1 border-b border-structure bg-transparent py-2 font-[family-name:var(--font-corpus)] text-sm text-ink outline-none placeholder:text-ink/35 focus:border-verdigris disabled:cursor-not-allowed"
            />
            <button
              type="button"
              onClick={submit}
              disabled={!canSend || !draft.trim()}
              className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-wide text-verdigris disabled:text-ink/25"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
