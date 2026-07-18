import { describe, expect, it } from "vitest";
import { estimateTokens } from "../chunking";
import {
  renderCompressedWorkSummary,
  renderWorkSummary,
} from "./memoryStore";

const summaries = [
  { passageId: "passage-1", ordinal: 1, text: "Opening argument about justice." },
  { passageId: "passage-2", ordinal: 2, text: "Later argument about education." },
];
const [firstSummary, secondSummary] = summaries;

describe("work-summary prompt rendering", () => {
  it("renders only the compact orientation note when compressed", () => {
    const rendered = renderWorkSummary({
      title: "The Republic",
      orientationSummary: "A dialogue about justice, political order, and education.",
      state: "compressed",
      summaries,
    });

    expect(rendered).toBe(
      "## About The Republic\nA dialogue about justice, political order, and education.",
    );
    expect(rendered).not.toContain("[p:passage-1]");
    expect(rendered).not.toContain(firstSummary!.text);
    expect(rendered).not.toContain(secondSummary!.text);
  });

  it("renders passage summaries with provenance markers when hydrated", () => {
    const rendered = renderWorkSummary({
      title: "The Republic",
      orientationSummary: "This must not replace source evidence.",
      state: "hydrated",
      summaries,
    });

    expect(rendered).toBe(
      [
        "## About The Republic",
        "[p:passage-1] §1: Opening argument about justice.",
        "[p:passage-2] §2: Later argument about education.",
      ].join("\n"),
    );
    expect(rendered).not.toContain("This must not replace source evidence.");
  });

  it("uses the same compact representation for rendering and compressed token accounting", () => {
    const rendered = renderCompressedWorkSummary({
      title: "The Republic",
      orientationSummary: "A dialogue about justice, political order, and education.",
    });

    // `workSummaryContent` derives compressedTokenCost from this exact helper.
    // Keeping that representation shared prevents planner and prompt drift.
    expect(estimateTokens(rendered)).toBe(Math.ceil(rendered.length / 4));
    expect(estimateTokens(rendered)).toBeLessThan(
      estimateTokens(
        renderWorkSummary({
          title: "The Republic",
          orientationSummary: "A dialogue about justice, political order, and education.",
          state: "hydrated",
          summaries,
        }),
      ),
    );
  });

  it("keeps a bounded, explicit fallback when an older work lacks an orientation note", () => {
    const rendered = renderWorkSummary({
      title: "The Republic",
      orientationSummary: null,
      state: "compressed",
      summaries,
    });

    expect(rendered).toBe(
      "## About The Republic\nOrientation unavailable — hydrate this work to inspect its section summaries.",
    );
    expect(rendered).not.toContain(firstSummary!.text);
  });
});
