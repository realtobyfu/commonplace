"use client";

import { use, useEffect, useRef, useState } from "react";

/**
 * The ingest screen (§9.3, H2 working position): works checklist with live
 * counts, a slow ticker of recent milestones, elapsed time, running cost.
 * No percentage bar — LLM latency is unknowable and the bar would lie.
 */

interface WorkRow {
  title: string;
  author: string;
  status: string;
  passages: number;
}

interface Milestone {
  kind: string;
  message: string;
  at: string;
}

const READING_STATUSES = new Set(["chunking", "summarizing", "embedding"]);

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min > 0 ? `${min}m ${sec}s` : `${sec}s`;
}

/** Render *emphasis* in domain messages as italics. */
function DomainMessage({ text }: { text: string }) {
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

export default function IngestPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = use(params);
  const [works, setWorks] = useState<WorkRow[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [costUsd, setCostUsd] = useState(0);
  const [done, setDone] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    const source = new EventSource(`/api/ingest/${workspaceId}/events`);
    source.addEventListener("milestone", (e) => {
      const m = JSON.parse((e as MessageEvent).data) as Milestone;
      setMilestones((prev) => [m, ...prev].slice(0, 8));
    });
    source.addEventListener("snapshot", (e) => {
      const s = JSON.parse((e as MessageEvent).data) as {
        works: WorkRow[];
        costUsd: number;
        done: boolean;
      };
      setWorks(s.works);
      setCostUsd(s.costUsd);
      setDone(s.done);
    });
    return () => source.close();
  }, [workspaceId]);

  useEffect(() => {
    if (done) return;
    startedAt.current ??= Date.now();
    const t = setInterval(
      () => setElapsed(Date.now() - (startedAt.current ?? Date.now())),
      1000,
    );
    return () => clearInterval(t);
  }, [done]);

  const byAuthor = new Map<string, WorkRow[]>();
  for (const w of works) {
    byAuthor.set(w.author, [...(byAuthor.get(w.author) ?? []), w]);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-10 px-8 py-16">
      <header>
        <h1 className="font-[family-name:var(--font-corpus)] text-3xl">
          {done ? "The shelf is ready." : "Reading the corpus…"}
        </h1>
        <p className="mt-2 flex gap-6 text-sm text-ink/60">
          <span>{formatElapsed(elapsed)} elapsed</span>
          <span className="font-[family-name:var(--font-mono)] text-xs leading-5">
            ${costUsd.toFixed(3)} spent
          </span>
        </p>
      </header>

      <section aria-label="Works">
        <ul className="divide-y divide-structure border-y border-structure">
          {[...byAuthor.entries()].map(([author, authorWorks]) => (
            <li key={author} className="py-3">
              <p className="text-xs uppercase tracking-wide text-ink/50">
                {author}
              </p>
              <ul className="mt-1 space-y-1">
                {authorWorks.map((w) => (
                  <li
                    key={w.title}
                    className="flex items-baseline justify-between gap-4"
                  >
                    <span
                      className={`font-[family-name:var(--font-corpus)] ${
                        w.status === "ingested"
                          ? "text-ink"
                          : READING_STATUSES.has(w.status)
                            ? "text-verdigris"
                            : "text-ink/40"
                      }`}
                    >
                      {w.title}
                      {READING_STATUSES.has(w.status) ? " …" : ""}
                    </span>
                    {w.passages > 0 && (
                      <span className="font-[family-name:var(--font-mono)] text-xs text-ink/50">
                        {w.passages} passages
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Recent milestones" aria-live="polite">
        <ul className="space-y-2 text-sm text-ink/70">
          {milestones.map((m, i) => (
            <li key={`${m.at}-${i}`} className={i === 0 ? "text-ink" : ""}>
              <DomainMessage text={m.message} />
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
