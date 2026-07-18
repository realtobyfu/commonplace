import { describe, expect, it } from "vitest";
import {
  countPromptTokens,
  planSynthesisPrompt,
  renderSynthesisPrompt,
} from "./promptBudget";

describe("synthesis prompt budget", () => {
  it("accounts for the exact rendered request, including system, question, and separators", () => {
    const system = "Answer only from supplied evidence.";
    const question = "How does justice relate to education?";
    const blocks = [
      { kind: "evidence" as const, text: "[p:a] Evidence one." },
      { kind: "orientation" as const, text: "## About Republic\nA dialogue about civic order." },
    ];
    const planned = planSynthesisPrompt({
      system,
      question,
      blocks,
      detailedEvidenceBudgetTokens: 1_000,
    });
    expect(planned.prompt).toBe(renderSynthesisPrompt({ question, blocks: planned.blocks }));
    expect(planned.budget.renderedInputTokens).toBe(
      countPromptTokens(system) + countPromptTokens(planned.prompt),
    );
  });

  it("caps orientation separately and keeps total input plus output reserve inside the provider window", () => {
    const planned = planSynthesisPrompt({
      system: "Ground every claim.",
      question: "Explain the disagreement.",
      detailedEvidenceBudgetTokens: 200_000,
      blocks: [
        { kind: "evidence", text: "evidence ".repeat(100_000) },
        { kind: "orientation", text: "orientation ".repeat(10_000) },
      ],
    });
    expect(planned.budget.orientationTokens).toBeLessThanOrEqual(planned.budget.orientationLimitTokens);
    expect(planned.budget.evidenceTokens).toBeLessThanOrEqual(planned.budget.evidenceLimitTokens);
    expect(planned.budget.renderedInputTokens + planned.budget.outputReserveTokens).toBeLessThanOrEqual(planned.budget.providerContextTokens);
  });
});
