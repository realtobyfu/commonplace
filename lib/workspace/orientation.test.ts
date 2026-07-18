import { describe, expect, it } from "vitest";
import { estimateTokens } from "@/lib/chunking";
import { capOrientationSummary, MAX_ORIENTATION_TOKENS } from "./orientation";

describe("capOrientationSummary", () => {
  it("leaves a compact orientation unchanged", () => {
    const text = "A dialogue about justice, education, and political order.";
    expect(capOrientationSummary(text)).toBe(text);
  });

  it("keeps a nearby complete sentence within the token allowance", () => {
    const text = `${"A useful orientation sentence. ".repeat(12)}Trailing detail.`;
    const capped = capOrientationSummary(text);
    expect(capped.endsWith(".")).toBe(true);
    expect(estimateTokens(capped)).toBeLessThanOrEqual(MAX_ORIENTATION_TOKENS);
  });

  it("uses an ellipsis when no sentence boundary fits", () => {
    const text = "x".repeat(400);
    const capped = capOrientationSummary(text);
    expect(capped.endsWith("…")).toBe(true);
    expect(estimateTokens(capped)).toBeLessThanOrEqual(MAX_ORIENTATION_TOKENS);
  });
});
