"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * The activity timeline (§14) — "what did it just do": router decision →
 * memory ops → synthesis, styled like the rest of the app rather than a
 * debug dump. Each row deep-links to the Jaeger trace in dev when a
 * traceId is present. Domain language only: the message IS the row; kind
 * is shown only as a small mono label for orientation.
 */

interface TimelineEntry {
  source: "event" | "memory_op";
  kind: string;
  message: string;
  actor?: "agent" | "user";
  traceId: string | null;
  at: string;
}

interface ActivityTimelineProps {
  workspaceId: string;
  onClose: () => void;
}

function formatClock(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Render *emphasis* segments in the corpus font, matching MemoryPanel. */
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

function Row({ entry, index }: { entry: TimelineEntry; index: number }) {
  return (
    <li
      className={`flex items-start justify-between gap-3 border-b border-structure px-5 py-3 text-sm ${
        index === 0 ? "text-ink" : "text-ink/60"
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="leading-relaxed">
          <Emphasized text={entry.message} />
        </p>
        <div className="mt-1 flex items-center gap-3">
          <span className="font-mono text-[10px] text-ink/35">
            {formatClock(entry.at)}
          </span>
          {entry.traceId && (
            <a
              href={`http://localhost:16686/trace/${entry.traceId}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[10px] text-ink-faint underline decoration-structure-strong underline-offset-2 hover:text-ink"
            >
              trace ↗
            </a>
          )}
        </div>
      </div>
      <span className="shrink-0 font-mono text-[10px] text-ink/30 uppercase">
        {entry.kind}
      </span>
    </li>
  );
}

export function ActivityTimeline({ workspaceId, onClose }: ActivityTimelineProps) {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/w/${workspaceId}/timeline`).catch(() => null);
    if (res?.ok) {
      const data = (await res.json()) as { entries: TimelineEntry[] };
      setEntries(data.entries);
    }
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await fetch(`/api/w/${workspaceId}/timeline`).catch(() => null);
      if (cancelled) return;
      if (res?.ok) {
        const data = (await res.json()) as { entries: TimelineEntry[] };
        if (!cancelled) setEntries(data.entries);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  return (
    <div className="flex h-full flex-col bg-paper-recessed">
      <div className="flex items-center justify-between border-b border-structure-strong px-5 py-4">
        <h2 className="text-xs font-semibold tracking-[0.08em] text-ink/60 uppercase">
          Activity
        </h2>
        <span className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => load()}
            aria-label="Refresh activity"
            className="font-mono text-[10px] text-ink/40 hover:text-ink"
          >
            refresh
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close activity timeline"
            className="text-ink/40 hover:text-ink"
          >
            ✕
          </button>
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && entries.length === 0 ? (
          <p className="px-5 py-4 text-xs leading-relaxed text-ink/45">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="px-5 py-4 text-xs leading-relaxed text-ink/45">
            Nothing has happened yet.
          </p>
        ) : (
          <ul>
            {entries.map((entry, i) => (
              <Row key={`${entry.source}-${entry.at}-${i}`} entry={entry} index={i} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
