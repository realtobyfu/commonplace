"use client";

import { useEffect, useRef, useState } from "react";
import { RichText } from "./RichText";

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

/** What `/api/passages/:id` returns — enough for a hover preview. */
interface PassagePreview {
  passageId: string;
  ordinal: number;
  heading: string | null;
  text: string;
  workTitle: string;
  author: string;
  cardIds: string[];
}

// Hover previews are immutable per session — cache at module level so a
// citation hovered in one message never refetches from another. `null`
// records a failed/404 lookup so we don't hammer the API for ids the
// model hallucinated.
const previewCache = new Map<string, PassagePreview | null>();

/**
 * A citation chip (§13.3): click opens the passage overlay and flashes the
 * parent card; hover (or keyboard focus) shows a floating preview of the
 * passage so the reader can check a source without leaving the answer.
 * `inline` renders the compact superscript "§" glyph used mid-prose; the
 * default renders the full "workTitle §ordinal" chip for the end-of-message
 * provenance row. Rendered entirely with <span>s so it can legally sit
 * inside the <p> elements RichText produces.
 */
function CitationChip({
  passageId,
  label,
  inline = false,
  onOpen,
}: {
  passageId: string;
  label?: string;
  inline?: boolean;
  onOpen: (passageId: string) => void;
}) {
  const [preview, setPreview] = useState<PassagePreview | null | undefined>(
    previewCache.get(passageId),
  );
  const [open, setOpen] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = () => {
    if (previewCache.has(passageId)) {
      setPreview(previewCache.get(passageId));
      return;
    }
    fetch(`/api/passages/${passageId}`)
      .then((res) => (res.ok ? (res.json() as Promise<PassagePreview>) : null))
      .catch(() => null)
      .then((data) => {
        previewCache.set(passageId, data);
        setPreview(data);
      });
  };

  // Small delay on hover so skimming across prose doesn't spray popovers;
  // keyboard focus opens immediately (delay 0) — a deliberate act.
  const show = (delay: number) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => {
      setOpen(true);
      load();
    }, delay);
  };
  const hide = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setOpen(false);
  };
  useEffect(
    () => () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
    },
    [],
  );

  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => show(250)}
      onMouseLeave={hide}
    >
      <button
        type="button"
        onClick={() => onOpen(passageId)}
        onFocus={() => show(0)}
        onBlur={hide}
        title={label ? `${label} — open the passage` : "Open the passage"}
        className={
          inline
            ? "mx-0.5 inline-flex items-center rounded-full bg-verdigris-wash px-1.5 py-0.5 align-baseline font-mono text-[10px] leading-none text-verdigris transition-colors hover:bg-verdigris hover:text-white"
            : "chip-cite"
        }
      >
        {inline ? "§" : label}
      </button>
      {open && (
        <span className="absolute bottom-full left-0 z-30 mb-2 block w-80 max-w-sm rounded-lg border border-structure-strong bg-white p-3 text-left shadow-lg">
          <span className="block font-mono text-[10px] text-ink-faint">
            {preview
              ? `${preview.author} · ${preview.workTitle} §${preview.ordinal}`
              : preview === null
                ? "passage unavailable"
                : "fetching passage…"}
          </span>
          {preview && (
            <span className="mt-1.5 line-clamp-6 block font-corpus text-[13px] leading-relaxed text-ink">
              {preview.text}
            </span>
          )}
          <span className="mt-2 block font-ui text-[10px] text-ink-faint">
            click to open
          </span>
        </span>
      )}
    </span>
  );
}

/** End-of-message source row (§13.3) — the authoritative citation display:
 *  the `done` frame strips inline markers server-side, so these chips are
 *  what survives after streaming settles. */
function ProvenanceChips({
  chips,
  onChipClick,
}: {
  chips: ProvenanceChipData[];
  onChipClick: (passageId: string) => void;
}) {
  if (chips.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <CitationChip
          key={chip.passageId}
          passageId={chip.passageId}
          label={`${chip.workTitle} §${chip.ordinal}`}
          onOpen={onChipClick}
        />
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
              <p className="font-corpus text-[2.25rem] leading-[1.25] text-ink">
                {promiseLine}
              </p>
              <div className="mx-auto mt-6 h-px w-10 bg-structure-strong" />

              <div className="mt-12 space-y-2.5 text-left">
                {starterPrompts.length === 0 ? (
                  <div className="space-y-2.5 pt-1">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="h-14 rounded-lg border border-dashed border-structure-strong bg-ink/[0.02]"
                        style={{ opacity: 0.8 - i * 0.18 }}
                      />
                    ))}
                    <p className="pt-2 text-center text-xs leading-relaxed text-ink-muted">
                      Starter prompts appear once the shelf finishes filling.
                    </p>
                  </div>
                ) : (
                  starterPrompts.map((p, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => canSend && onSend(p.prompt)}
                      className="block w-full rounded-lg border border-structure-strong bg-white px-4 py-3.5 text-left shadow-[0_1px_0_0_rgba(31,35,40,0.03)] transition-all hover:border-ink-faint hover:shadow-sm"
                    >
                      <RichText
                        text={p.prompt}
                        className="font-corpus text-[15px] text-ink"
                      />
                      <span className="mt-1.5 block font-mono text-[10px] tracking-wide text-ink-faint uppercase">
                        {BEHAVIOR_LABEL[p.behavior] ?? p.behavior}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-9">
            {messages.map((m) =>
              m.role === "user" ? (
                // The contained right-aligned block marks the speaker on its
                // own — no "You" label needed. User text is verbatim, never
                // markdown.
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-xl bg-paper-recessed px-4 py-2.5 font-corpus text-[15.5px] leading-relaxed whitespace-pre-wrap text-ink">
                    {m.content}
                  </div>
                </div>
              ) : (
                <div key={m.id}>
                  <p className="text-[11px] font-semibold tracking-[0.08em] text-ink-faint uppercase">
                    Commonplace
                  </p>
                  {m.streaming && m.content === "" ? (
                    <p className="mt-2 font-corpus text-[16.5px] leading-relaxed text-ink-faint">
                      …
                    </p>
                  ) : (
                    // Inline chips are best-effort: markers only exist in raw
                    // stream deltas — the `done` frame swaps in server-cleaned
                    // text, after which ProvenanceChips below is the source
                    // display.
                    <RichText
                      text={m.content}
                      renderCitation={(passageId) => (
                        <CitationChip
                          passageId={passageId}
                          inline
                          onOpen={onChipClick}
                        />
                      )}
                      className="mt-2 font-corpus text-[16.5px] leading-relaxed text-ink"
                    />
                  )}
                  <ProvenanceChips
                    chips={m.provenance}
                    onChipClick={onChipClick}
                  />
                </div>
              ),
            )}
          </div>
        )}
      </div>

      <div className="border-t border-structure-strong px-10 py-5">
        <div className="mx-auto max-w-2xl">
          {pendingInterrupt && (
            <div className="mb-3 rounded-lg border border-verdigris/40 bg-verdigris-wash px-4 py-3">
              <p className="text-sm text-ink">
                Bringing{" "}
                <em className="font-corpus">
                  {pendingInterrupt.label}
                </em>{" "}
                into memory adds{" "}
                <span className="font-mono text-xs text-verdigris">
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
                  className="btn-primary"
                >
                  Bring it in
                </button>
                <button
                  type="button"
                  onClick={onCancelInterrupt}
                  className="btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {statusLine && (
            <p
              className="flex items-center gap-2 pb-2.5 text-[12px] text-verdigris"
              aria-live="polite"
            >
              <span
                className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-verdigris"
                aria-hidden
              />
              <span>
                <Emphasized text={statusLine} />
              </span>
            </p>
          )}
          <div className="input-shell">
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
              className="flex-1 bg-transparent font-corpus text-[15px] text-ink outline-none placeholder:text-ink-faint disabled:cursor-not-allowed"
            />
            <button
              type="button"
              onClick={submit}
              disabled={!canSend || !draft.trim()}
              aria-label="Send"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-white transition-colors hover:bg-[#2b3138] disabled:cursor-not-allowed disabled:bg-structure-strong"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
