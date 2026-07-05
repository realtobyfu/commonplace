"use client";

import { useEffect, useState } from "react";

/**
 * Cost meter (§15) — sits inside the settings drawer. Total spend vs the
 * MAX_SPEND_USD hard stop as a single line with a thin progress bar, then
 * a per-job breakdown. Money is not memory: the fill uses bg-ink, never
 * verdigris (verdigris means "in memory" elsewhere in the app).
 */

interface JobBreakdown {
  job: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

interface CostsResponse {
  totalUsd: number;
  capUsd: number;
  byJob: JobBreakdown[];
  byWorkspace: Array<{ workspaceId: string; costUsd: number }>;
}

export function CostsSection() {
  const [data, setData] = useState<CostsResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/costs")
      .then((res) => (res.ok ? res.json() : null))
      .then((json: CostsResponse | null) => {
        if (!cancelled && json) setData(json);
      })
      .catch(() => {
        /* quiet — cost meter is non-critical */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) {
    return (
      <p className="text-xs leading-relaxed text-ink/45">Loading spend…</p>
    );
  }

  const pct = Math.min(100, Math.round((data.totalUsd / data.capUsd) * 100));
  const atCap = data.totalUsd >= data.capUsd;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-ink">Spend</span>
        <span className="font-[family-name:var(--font-mono)] text-[10px] text-ink/50">
          ${data.totalUsd.toFixed(2)} of ${data.capUsd.toFixed(2)}
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-structure-strong/60">
        <div
          className="h-full min-w-[3px] rounded-full bg-ink transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      {atCap && (
        <p className="mt-1.5 text-xs leading-relaxed text-ink/45">
          Spend cap reached — paid calls are refused until MAX_SPEND_USD is raised.
        </p>
      )}

      {data.byJob.length > 0 && (
        <div className="mt-5 border-t border-structure pt-3">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-ink/40">
                <th className="pb-1.5 text-left font-normal font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide">
                  Job
                </th>
                <th className="pb-1.5 text-right font-normal font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide">
                  Calls
                </th>
                <th className="pb-1.5 text-right font-normal font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide">
                  Cost
                </th>
              </tr>
            </thead>
            <tbody>
              {data.byJob.map((j) => (
                <tr key={j.job} className="border-t border-structure">
                  <td className="py-1.5 font-[family-name:var(--font-mono)] text-[11px] text-ink/70">
                    {j.job}
                  </td>
                  <td className="py-1.5 text-right text-ink/60">{j.calls}</td>
                  <td className="py-1.5 text-right font-[family-name:var(--font-mono)] text-[11px] text-ink/70">
                    {j.costUsd.toFixed(3)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
