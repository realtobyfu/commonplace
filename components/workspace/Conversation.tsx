"use client";

import { useState } from "react";

/**
 * The conversation surface (§13.3) and empty state (§13.4). Starter prompts
 * are read from the workspace row — never hardcoded — and fall back to a
 * ghost placeholder when ingestion hasn't produced them yet, exactly like
 * the memory panel's ghost cards.
 */

export interface StarterPrompt {
  prompt: string;
  behavior: string;
}

export interface ConversationMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

interface ConversationProps {
  promiseLine: string;
  starterPrompts: StarterPrompt[];
  messages: ConversationMessage[];
  ingestionDone: boolean;
  onSend: (text: string) => void;
}

const BEHAVIOR_LABEL: Record<string, string> = {
  "cross-thinker": "side-by-side hydration",
  sequential: "cards accumulate",
  "deep-dive": "one work unfolds",
};

export function Conversation({
  promiseLine,
  starterPrompts,
  messages,
  ingestionDone,
  onSend,
}: ConversationProps) {
  const [draft, setDraft] = useState("");

  const submit = () => {
    const text = draft.trim();
    if (!text || !ingestionDone) return;
    onSend(text);
    setDraft("");
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto px-10 py-12">
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
                    onClick={() => onSend(p.prompt)}
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
                <p className="mt-1 font-[family-name:var(--font-corpus)] text-base leading-relaxed text-ink whitespace-pre-wrap">
                  {m.content}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-structure px-10 py-5">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
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
            disabled={!ingestionDone || !draft.trim()}
            className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-wide text-verdigris disabled:text-ink/25"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
