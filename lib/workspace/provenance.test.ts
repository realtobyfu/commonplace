import { describe, expect, it } from "vitest";
import { parseRouterPicks, stripProvenanceMarkers } from "./provenance";

const ID_A = "11111111-2222-3333-4444-555555555555";
const ID_B = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("stripProvenanceMarkers", () => {
  it("removes markers and collects passage ids in order", () => {
    const text = `Nietzsche inverts this [[p:${ID_A}]] while Plato grounds it in the forms [[p:${ID_B}]].`;
    const { clean, passageIds } = stripProvenanceMarkers(text);
    expect(clean).toBe(
      "Nietzsche inverts this while Plato grounds it in the forms.",
    );
    expect(passageIds).toEqual([ID_A, ID_B]);
  });

  it("dedupes repeated citations, keeping first-seen order", () => {
    const text = `A [[p:${ID_B}]] B [[p:${ID_A}]] C [[p:${ID_B}]]`;
    const { passageIds } = stripProvenanceMarkers(text);
    expect(passageIds).toEqual([ID_B, ID_A]);
  });

  it("leaves text without markers untouched", () => {
    const { clean, passageIds } = stripProvenanceMarkers("No claims here.");
    expect(clean).toBe("No claims here.");
    expect(passageIds).toEqual([]);
  });

  it("strips bare-UUID markers too — gpt-oss-120b regularly drops the p: prefix", () => {
    const text = `Kant's universalizability test [[${ID_A}]] versus Schopenhauer's compassion [[${ID_B}]].`;
    const { clean, passageIds } = stripProvenanceMarkers(text);
    expect(clean).toBe(
      "Kant's universalizability test versus Schopenhauer's compassion.",
    );
    expect(passageIds).toEqual([ID_A, ID_B]);
  });

  it("strips malformed citation attempts without counting them as real citations", () => {
    // verified live: gpt-oss-120b sometimes cites a short ordinal ("§11")
    // instead of the real passage UUID — never resolvable, but should not
    // leak "[[p:11]]" into the reader-facing prose either.
    const text = "Moral judgments are reactive and hostile. [[p:11]], [[p:19]]";
    const { clean, passageIds } = stripProvenanceMarkers(text);
    expect(clean).toBe("Moral judgments are reactive and hostile.");
    expect(passageIds).toEqual([]);
  });

  it("strips fullwidth-bracket ordinal citations the model improvises", () => {
    // verified live: gpt-oss-120b sometimes emits 【p:30】 instead of [[p:uuid]]
    const text = "justice is clarified in the city soul 【p:30】 . And again 【p:31】.";
    const { clean, passageIds } = stripProvenanceMarkers(text);
    expect(clean).toBe("justice is clarified in the city soul. And again.");
    expect(passageIds).toEqual([]);
  });
});

describe("parseRouterPicks", () => {
  it("parses a bare JSON array", () => {
    const picks = parseRouterPicks(
      `[{"type":"card","id":"c1"},{"type":"work","id":"w1"}]`,
    );
    expect(picks).toEqual([
      { type: "card", id: "c1" },
      { type: "work", id: "w1" },
    ]);
  });

  it("parses an {items: [...]} object", () => {
    const picks = parseRouterPicks(`{"items":[{"type":"card","id":"c1"}]}`);
    expect(picks).toEqual([{ type: "card", id: "c1" }]);
  });

  it("survives prose and code fences around the JSON", () => {
    const picks = parseRouterPicks(
      'Sure! Here is the selection:\n```json\n{"items":[{"type":"card","id":"c9"}]}\n```',
    );
    expect(picks).toEqual([{ type: "card", id: "c9" }]);
  });

  it("returns [] on garbage (loop falls back to retrieval)", () => {
    expect(parseRouterPicks("I cannot answer that.")).toEqual([]);
    expect(parseRouterPicks("")).toEqual([]);
    expect(parseRouterPicks(`{"items": "none"}`)).toEqual([]);
  });

  it("drops entries with wrong shape, keeps valid ones", () => {
    const picks = parseRouterPicks(
      `[{"type":"card","id":"ok"},{"type":"shelf","id":"bad"},{"type":"work"}]`,
    );
    expect(picks).toEqual([{ type: "card", id: "ok" }]);
  });
});
