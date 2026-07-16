"use client";

import { useState } from "react";
import { NEVER_ASK, type WorkspaceSettings } from "@/lib/workspace/settings";
import { CostsSection } from "./CostsSection";

/**
 * Memory settings drawer — the H3/H5 tunables (§10.2 budget, staleness
 * weighting, and the H5 ask-before-large-load threshold). Slides over from
 * the memory panel; changes PATCH to /api/w/:id/settings and take effect on
 * the next turn. The eventual P8 settings drawer will grow routing + cost
 * sections around this same panel.
 */

interface SettingsDrawerProps {
  workspaceId: string;
  settings: WorkspaceSettings;
  onClose: () => void;
  onSaved: (settings: WorkspaceSettings) => void;
}

const DEFAULT_ASK_THRESHOLD = 8_000;

export function SettingsDrawer({
  workspaceId,
  settings,
  onClose,
  onSaved,
}: SettingsDrawerProps) {
  const [tokenBudget, setTokenBudget] = useState(settings.tokenBudget);
  const [stalenessWeight, setStalenessWeight] = useState(settings.stalenessWeight);
  const [relevanceWeight, setRelevanceWeight] = useState(settings.relevanceWeight);
  const [askEnabled, setAskEnabled] = useState(settings.askAboveTokens < NEVER_ASK);
  const [askThreshold, setAskThreshold] = useState(
    settings.askAboveTokens < NEVER_ASK ? settings.askAboveTokens : DEFAULT_ASK_THRESHOLD,
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const patch: WorkspaceSettings = {
      tokenBudget,
      stalenessWeight,
      relevanceWeight,
      askAboveTokens: askEnabled ? askThreshold : NEVER_ASK,
    };
    const res = await fetch(`/api/w/${workspaceId}/settings`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => null);
    setSaving(false);
    if (res?.ok) {
      const { settings: saved } = (await res.json()) as { settings: WorkspaceSettings };
      onSaved(saved);
      onClose();
    }
  };

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-paper-recessed">
      <div className="flex items-center justify-between border-b border-structure-strong px-5 py-4">
        <h2 className="text-xs font-semibold tracking-[0.08em] text-ink/60 uppercase">
          Memory settings
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close settings"
          className="text-ink/40 hover:text-ink"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 space-y-7 overflow-y-auto px-5 py-5">
        <Field
          label="Token budget"
          hint="How much the model holds at once. The meter fills toward this."
          value={`${tokenBudget.toLocaleString()} tokens`}
        >
          <input
            type="range"
            min={16_000}
            max={200_000}
            step={8_000}
            value={tokenBudget}
            onChange={(e) => setTokenBudget(Number(e.target.value))}
            className="w-full accent-[var(--color-ink)]"
          />
        </Field>

        <Field
          label="Staleness weighting"
          hint={
            stalenessWeight === 0
              ? "Evicting by importance only — age ignored."
              : stalenessWeight >= 2
                ? "Recency dominates — the stalest cards compress first."
                : "Balanced between recency and importance."
          }
          value={stalenessWeight.toFixed(1)}
        >
          <input
            type="range"
            min={0}
            max={3}
            step={0.5}
            value={stalenessWeight}
            onChange={(e) => setStalenessWeight(Number(e.target.value))}
            className="w-full accent-[var(--color-ink)]"
          />
        </Field>

        <Field
          label="Relevance weighting"
          hint={
            relevanceWeight === 0
              ? "Relevance ignored — eviction runs on recency and importance alone."
              : relevanceWeight >= 2
                ? "On-topic cards are strongly spared, even when stale."
                : "A card that's on-topic for the question resists eviction."
          }
          value={relevanceWeight.toFixed(1)}
        >
          <input
            type="range"
            min={0}
            max={3}
            step={0.5}
            value={relevanceWeight}
            onChange={(e) => setRelevanceWeight(Number(e.target.value))}
            className="w-full accent-[var(--color-ink)]"
          />
        </Field>

        <Field
          label="Ask before large loads"
          hint={
            askEnabled
              ? "The agent pauses and asks before bringing in more than the threshold."
              : "Act and narrate — the agent loads freely and just tells you."
          }
          value={askEnabled ? `> ${askThreshold.toLocaleString()} tokens` : "off"}
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={askEnabled}
              onClick={() => setAskEnabled((v) => !v)}
              className={`relative h-5 w-9 rounded-full transition-colors ${
                askEnabled ? "bg-ink" : "bg-structure-strong"
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                  askEnabled ? "left-[1.125rem]" : "left-0.5"
                }`}
              />
            </button>
            {askEnabled && (
              <input
                type="range"
                min={2_000}
                max={40_000}
                step={2_000}
                value={askThreshold}
                onChange={(e) => setAskThreshold(Number(e.target.value))}
                className="flex-1 accent-[var(--color-ink)]"
              />
            )}
          </div>
        </Field>

        <div className="border-t border-structure pt-5">
          <h3 className="pb-3 text-xs font-semibold tracking-[0.08em] text-ink/60 uppercase">
            Spend
          </h3>
          <CostsSection />
        </div>
      </div>

      <div className="border-t border-structure-strong px-5 py-4">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="w-full rounded-sm bg-ink py-2 font-mono text-xs tracking-wide text-paper uppercase disabled:opacity-50"
        >
          {saving ? "Saving…" : "Apply"}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  value,
  children,
}: {
  label: string;
  hint: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="text-sm text-ink">{label}</label>
        <span className="font-mono text-[10px] text-ink-muted">
          {value}
        </span>
      </div>
      <div className="mt-2">{children}</div>
      <p className="mt-1.5 text-xs leading-relaxed text-ink/45">{hint}</p>
    </div>
  );
}
