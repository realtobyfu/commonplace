import { describe, expect, it } from "vitest";
import { chooseDiverseCardMatches } from "./conceptCards";

const match = (passageId: string, work: string) => ({
  passageId,
  work,
  author: "Author",
  summary: passageId,
  weight: 1,
});

describe("chooseDiverseCardMatches", () => {
  it("round-robins source works without exceeding the evidence cap", () => {
    const selected = chooseDiverseCardMatches(
      [match("a1", "A"), match("a2", "A"), match("a3", "A"), match("b1", "B"), match("c1", "C")],
      4,
    );

    expect(selected.map((item) => item.passageId)).toEqual(["a1", "b1", "c1", "a2"]);
  });

  it("keeps relevance order when every candidate comes from one work", () => {
    expect(
      chooseDiverseCardMatches([match("a1", "A"), match("a2", "A")], 8).map((item) => item.passageId),
    ).toEqual(["a1", "a2"]);
  });
});
