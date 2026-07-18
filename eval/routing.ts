/**
 * Stage-1 routing eval: does the embedding shortlist contain the works/cards
 * linked to human-reviewed gold passages before the LLM router sees it?
 *
 *   npm run eval-routing                    # local shortlist only
 *   npm run eval-routing -- 20 10           # override card/work caps
 *   npm run eval-routing -- 12 6 4 --router # also evaluate the LLM router
 */
try {
  process.loadEnvFile(".env");
} catch {
  // Defaults remain useful for local development.
}

import { and, cosineDistance, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "../lib/db";
import { chat, embed } from "../lib/llm";
import { parseRouterPicks } from "../lib/workspace/provenance";
import { GOLDEN } from "./golden";

const numericArgs = process.argv.slice(2).filter((arg) => /^\d+$/.test(arg)).map(Number);
const cardCap = numericArgs[0] || 12;
const workCap = numericArgs[1] || 6;
const routerCap = numericArgs[2] || 4;
const evaluateRouter = process.argv.includes("--router");

interface Aggregate {
  hit: number;
  recall: number;
  precision: number;
  n: number;
}

function add(agg: Aggregate, selected: string[], expected: Set<string>) {
  if (expected.size === 0) return;
  const found = new Set(selected.filter((id) => expected.has(id)));
  agg.hit += found.size > 0 ? 1 : 0;
  agg.recall += found.size / expected.size;
  // Empty candidate sets do not get free precision. They are a failed
  // retrieval, not a perfectly selective one.
  agg.precision += selected.length === 0 ? 0 : found.size / selected.length;
  agg.n++;
}

function pct(value: number, n: number) {
  return n === 0 ? "n/a" : `${((100 * value) / n).toFixed(0)}%`;
}

async function main() {
  const cards: Aggregate = { hit: 0, recall: 0, precision: 0, n: 0 };
  const works: Aggregate = { hit: 0, recall: 0, precision: 0, n: 0 };
  const routed: Aggregate = { hit: 0, recall: 0, precision: 0, n: 0 };
  let totalMs = 0;
  let routerInputTokens = 0;
  let routerOutputTokens = 0;
  let routerCostUsd = 0;

  console.log(`\nRouting shortlist eval — cards=${cardCap}, works=${workCap}\n`);
  console.log("  case".padEnd(30) + "cards".padEnd(14) + "works");

  for (const item of GOLDEN) {
    const started = performance.now();
    const queryVec = (await embed([item.question]))?.[0];
    if (!queryVec) throw new Error("Embedding unavailable; start Ollama before routing eval.");

    const cardRows = await db
      .select({
        id: schema.conceptCards.id,
        title: schema.conceptCards.title,
        authorScope: schema.conceptCards.authorScope,
      })
      .from(schema.conceptCards)
      .where(
        and(
          eq(schema.conceptCards.packId, item.pack),
          isNotNull(schema.conceptCards.embedding),
        ),
      )
      .orderBy(cosineDistance(schema.conceptCards.embedding, queryVec))
      .limit(cardCap);

    const nearest = sql<number>`min(${cosineDistance(schema.passages.embedding, queryVec)})`;
    const workRows = await db
      .select({ id: schema.works.id, title: schema.works.title, author: schema.works.author })
      .from(schema.works)
      .innerJoin(schema.passages, eq(schema.passages.workId, schema.works.id))
      .where(
        and(
          eq(schema.works.packId, item.pack),
          eq(schema.works.status, "ingested"),
          isNotNull(schema.passages.embedding),
        ),
      )
      .groupBy(schema.works.id)
      .orderBy(nearest)
      .limit(workCap);

    const goldWorks = await db
      .select({ id: schema.passages.workId })
      .from(schema.passages)
      .where(inArray(schema.passages.id, item.relevantPassageIds));
    const goldCards = await db
      .select({ id: schema.cardPassages.cardId })
      .from(schema.cardPassages)
      .where(inArray(schema.cardPassages.passageId, item.relevantPassageIds));

    const expectedWorks = new Set(goldWorks.map((row) => row.id));
    const expectedCards = new Set(goldCards.map((row) => row.id));
    const selectedWorks = workRows.map((row) => row.id);
    const selectedCards = cardRows.map((row) => row.id);
    const foundWorks = selectedWorks.filter((id) => expectedWorks.has(id)).length;
    const foundCards = selectedCards.filter((id) => expectedCards.has(id)).length;
    add(works, selectedWorks, expectedWorks);
    add(cards, selectedCards, expectedCards);

    if (evaluateRouter) {
      const index = [
        "CONCEPT CARDS:",
        ...cardRows.map(
          (card) => `- card ${card.id} :: ${card.title} [${card.authorScope.join(", ")}]`,
        ),
        "WORKS:",
        ...workRows.map((work) => `- work ${work.id} :: ${work.title} (${work.author})`),
      ].join("\n");
      const result = await chat("router", {
        system:
          "You route a reader's question to source material. From the index, pick the entries the answer needs — " +
          `at most ${routerCap}, fewer is better. Prefer cards over whole works. ` +
          'Reply with strict JSON only: {"items":[{"type":"card"|"work","id":"<id from the index>"}]}.',
        prompt: `${index}\n\nQuestion: ${item.question}`,
        json: true,
        maxTokens: 1500,
        temperature: 0,
      });
      const validIds = new Set([...selectedCards, ...selectedWorks]);
      const selected = parseRouterPicks(result.text)
        .filter((pick) => validIds.has(pick.id))
        .slice(0, routerCap)
        .map((pick) => pick.id);
      const acceptable = new Set([...expectedCards, ...expectedWorks]);
      add(routed, selected, acceptable);
      routerInputTokens += result.inputTokens;
      routerOutputTokens += result.outputTokens;
      routerCostUsd += result.costUsd;
    }
    totalMs += performance.now() - started;

    const cardCell =
      expectedCards.size === 0 ? "n/a" : `${foundCards}/${expectedCards.size}`;
    console.log(
      `  ${item.id}`.padEnd(30) + cardCell.padEnd(14) + `${foundWorks}/${expectedWorks.size}`,
    );
  }

  console.log("\nAGGREGATE");
  console.log(`  card evidence coverage  ${pct(cards.n, GOLDEN.length)} (${cards.n}/${GOLDEN.length} cases have linked cards)`);
  console.log(`  card candidate hit      ${pct(cards.hit, cards.n)} (${cards.n} eligible cases)`);
  console.log(`  card candidate recall   ${cards.n === 0 ? "n/a" : (cards.recall / cards.n).toFixed(2)}`);
  console.log(`  card candidate precision ${cards.n === 0 ? "n/a" : (cards.precision / cards.n).toFixed(2)} (1 - this is irrelevant-card rate)`);
  console.log(`  work candidate hit      ${pct(works.hit, works.n)}`);
  console.log(`  work candidate recall   ${(works.recall / works.n).toFixed(2)}`);
  console.log(`  work candidate precision ${(works.precision / works.n).toFixed(2)} (1 - this is irrelevant-work rate)`);
  if (evaluateRouter) {
    console.log(`  router selection hit    ${pct(routed.hit, routed.n)}`);
    console.log(`  router selection recall ${(routed.recall / routed.n).toFixed(2)}`);
    console.log(`  router precision        ${(routed.precision / routed.n).toFixed(2)}`);
    console.log(`  router input tokens     ${routerInputTokens} (${(routerInputTokens / routed.n).toFixed(0)} mean/question)`);
    console.log(`  router output tokens    ${routerOutputTokens} (${(routerOutputTokens / routed.n).toFixed(0)} mean/question)`);
    console.log(`  router cost             $${routerCostUsd.toFixed(4)} ($${(routerCostUsd / routed.n).toFixed(4)} mean/question)`);
  }
  console.log(`  mean stage latency      ${(totalMs / GOLDEN.length).toFixed(0)}ms\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
