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

/** H5: a large load waiting for the user's go-ahead. */
export interface PendingInterrupt {
  text: string;
  userMsgId: string;
  label: string;
  itemCount: number;
  incomingTokens: number;
}

interface ConversationProps {
  promiseLine: string;
  starterPrompts: StarterPrompt[];
  messages: ChatMessage[];
  ingestionDone: boolean;
  statusLine: string | null;
  busy: boolean;
  onSend: (text: string) => void;
  pendingInterrupt: PendingInterrupt | null;
  onApproveInterrupt: () => void;
  onCancelInterrupt: () => void;
  onChipClick: (passageId: string) => void;
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

function ProvenanceChips({
  chips,
  onChipClick,
}: {
  chips: ProvenanceChipData[];
  onChipClick: (passageId: string) => void;
}) {
  if (chips.length === 0) return null;
  return (
    <div className="mt-2.5 flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <button
          key={chip.passageId}
          type="button"
          onClick={() => onChipClick(chip.passageId)}
          title={`${chip.author}, ${chip.workTitle} §${chip.ordinal} — open the passage`}
          className="rounded-full bg-verdigris-wash px-2.5 py-1 font-[family-name:var(--font-mono)] text-[10px] text-verdigris transition-colors hover:bg-verdigris hover:text-white"
        >
          {chip.workTitle} §{chip.ordinal}
        </button>
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
  pendingInterrupt,
  onApproveInterrupt,
  onCancelInterrupt,
  onChipClick,
}: ConversationProps) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, pendingInterrupt]);

  const canSend = ingestionDone && !busy;
  const submit = () => {
    const text = draft.trim();
    if (!text || !canSend) return;
    onSend(text);
    setDraft("");
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-paper">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-10 py-12">
        {messages.length === 0 ? (
          <div className="flex h-full min-h-[420px] items-center justify-center">
            <div className="mx-auto max-w-xl text-center">
              <div className="mx-auto mb-6 h-px w-10 bg-structure-strong" />
              <p className="font-[family-name:var(--font-corpus)] text-[2.25rem] leading-[1.25] text-ink">
                {promiseLine}
              </p>
              <div className="mx-auto mt-6 h-px w-10 bg-structure-strong" />

              <div className="mt-12 space-y-2.5 text-left">
                {starterPrompts.length === 0 ? (
                  <div className="space-y-2.5 pt-1">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="h-14 rounded-sm border border-dashed border-structure-strong bg-ink/[0.02]"
                        style={{ opacity: 0.8 - i * 0.18 }}
                      />
                    ))}
                    <p className="pt-2 text-center text-xs leading-relaxed text-ink/45">
                      Starter prompts appear once the shelf finishes filling.
                    </p>
                  </div>
                ) : (
                  starterPrompts.map((p, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => canSend && onSend(p.prompt)}
                      className="block w-full rounded-sm border border-structure-strong bg-white px-4 py-3.5 text-left shadow-[0_1px_0_0_rgba(31,35,40,0.03)] transition-colors hover:border-verdigris/50"
                    >
                      <span className="font-[family-name:var(--font-corpus)] text-[15px] text-ink">
                        <Emphasized text={p.prompt} />
                      </span>
                      <span className="mt-1.5 block font-[family-name:var(--font-mono)] text-[10px] tracking-wide text-verdigris uppercase">
                        {BEHAVIOR_LABEL[p.behavior] ?? p.behavior}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-8">
            {messages.map((m) => (
              <div key={m.id}>
                <p className="text-[11px] font-semibold tracking-[0.08em] text-ink/45 uppercase">
                  {m.role === "user" ? "You" : "Commonplace"}
                </p>
                <p className="mt-1.5 font-[family-name:var(--font-corpus)] text-[17px] leading-relaxed whitespace-pre-wrap text-ink">
                  {m.content}
                  {m.streaming && m.content === "" && (
                    <span className="text-ink/35">…</span>
                  )}
                </p>
                <ProvenanceChips chips={m.provenance} onChipClick={onChipClick} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-structure-strong px-10 py-5">
        <div className="mx-auto max-w-2xl">
          {pendingInterrupt && (
            <div className="mb-3 rounded-sm border border-verdigris/40 bg-verdigris-wash px-4 py-3">
              <p className="text-sm text-ink">
                Bringing{" "}
                <em className="font-[family-name:var(--font-corpus)]">
                  {pendingInterrupt.label}
                </em>{" "}
                into memory adds{" "}
                <span className="font-[family-name:var(--font-mono)] text-xs text-verdigris">
                  ~{pendingInterrupt.incomingTokens.toLocaleString()} tokens
                </span>
                {pendingInterrupt.itemCount > 1
                  ? ` (${pendingInterrupt.itemCount} items).`
                  : "."}{" "}
                Load it?
              </p>
              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  onClick={onApproveInterrupt}
                  className="rounded-sm bg-verdigris px-3 py-1.5 font-[family-name:var(--font-mono)] text-[11px] tracking-wide text-white uppercase"
                >
                  Bring it in
                </button>
                <button
                  type="button"
                  onClick={onCancelInterrupt}
                  className="rounded-sm border border-structure-strong px-3 py-1.5 font-[family-name:var(--font-mono)] text-[11px] tracking-wide text-ink/60 uppercase hover:text-ink"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
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
              className="flex-1 border-b border-structure-strong bg-transparent py-2 font-[family-name:var(--font-corpus)] text-[15px] text-ink outline-none placeholder:text-ink/35 focus:border-verdigris disabled:cursor-not-allowed"
            />
            <button
              type="button"
              onClick={submit}
              disabled={!canSend || !draft.trim()}
              className="font-[family-name:var(--font-mono)] text-xs tracking-wide text-verdigris uppercase disabled:text-ink/25"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
