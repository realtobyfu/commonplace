/**
 * Grid-search routing shortlist sizes against reviewed golden evidence.
 *
 *   pnpm tsx eval/sweep-routing.ts
 *   pnpm tsx eval/sweep-routing.ts --router
 *
 * The default is deliberately local-only: it sweeps card/work shortlists
 * without paying for router calls. --router adds the selection-cap dimension
 * and records the model tokens and cost. Results are ranked by macro F1 over
 * the reviewed evidence links, then latency; this is a decision aid, not an
 * automatic production-config writer.
 */
try { process.loadEnvFile(".env"); } catch { /* shell env is fine */ }

import { and, cosineDistance, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "../lib/db";
import { chat, embed } from "../lib/llm";
import { parseRouterPicks } from "../lib/workspace/provenance";
import { GOLDEN } from "./golden";

const CARD_CAPS = [4, 8, 12, 16];
const WORK_CAPS = [2, 4, 6, 8];
const ROUTER_CAPS = [2, 4, 6];
const useRouter = process.argv.includes("--router");

const f1 = (precision: number, recall: number) =>
  precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

interface Case {
  id: string;
  question: string;
  pack: string;
  vector: number[];
  cards: Set<string>;
  works: Set<string>;
}

async function loadCases(): Promise<Case[]> {
  const ids = [...new Set(GOLDEN.flatMap((item) => item.relevantPassageIds))];
  const [workRows, cardRows] = await Promise.all([
    db.select({ passageId: schema.passages.id, workId: schema.passages.workId })
      .from(schema.passages).where(inArray(schema.passages.id, ids)),
    db.select({ passageId: schema.cardPassages.passageId, cardId: schema.cardPassages.cardId })
      .from(schema.cardPassages).where(inArray(schema.cardPassages.passageId, ids)),
  ]);
  const workByPassage = new Map(workRows.map((r) => [r.passageId, r.workId]));
  const cardsByPassage = new Map<string, string[]>();
  for (const row of cardRows) cardsByPassage.set(row.passageId, [...(cardsByPassage.get(row.passageId) ?? []), row.cardId]);

  const vectors = await embed(GOLDEN.map((item) => item.question));
  if (!vectors || vectors.length !== GOLDEN.length) throw new Error("Embedding unavailable; start Ollama before sweeping.");
  return GOLDEN.map((item, i) => {
    const vector = vectors[i];
    // Length was checked above; keep this guard so a malformed embedding
    // response cannot turn into an unscored query at runtime.
    if (!vector) throw new Error(`Missing embedding for golden item ${item.id}`);
    return {
    id: item.id, question: item.question, pack: item.pack, vector,
    works: new Set(item.relevantPassageIds.map((id) => workByPassage.get(id)).filter((id): id is string => !!id)),
    cards: new Set(item.relevantPassageIds.flatMap((id) => cardsByPassage.get(id) ?? [])),
    };
  });
}

async function candidates(item: Case, cardCap: number, workCap: number) {
  const nearest = sql<number>`min(${cosineDistance(schema.passages.embedding, item.vector)})`;
  const [cards, works] = await Promise.all([
    db.select({ id: schema.conceptCards.id, title: schema.conceptCards.title, authorScope: schema.conceptCards.authorScope })
      .from(schema.conceptCards)
      .where(and(eq(schema.conceptCards.packId, item.pack), isNotNull(schema.conceptCards.embedding)))
      .orderBy(cosineDistance(schema.conceptCards.embedding, item.vector)).limit(cardCap),
    db.select({ id: schema.works.id, title: schema.works.title, author: schema.works.author })
      .from(schema.works).innerJoin(schema.passages, eq(schema.passages.workId, schema.works.id))
      .where(and(eq(schema.works.packId, item.pack), eq(schema.works.status, "ingested"), isNotNull(schema.passages.embedding)))
      .groupBy(schema.works.id).orderBy(nearest).limit(workCap),
  ]);
  return { cards, works };
}

async function main() {
  const cases = await loadCases();
  const results: Array<{ config: string; f1: number; precision: number; recall: number; latencyMs: number; tokens: number; cost: number }> = [];
  const routerCaps = useRouter ? ROUTER_CAPS : [0];
  console.log(`Sweeping ${CARD_CAPS.length * WORK_CAPS.length * routerCaps.length} configurations over ${cases.length} reviewed questions${useRouter ? " (with router)" : " (local shortlist only)"}.`);

  for (const cardCap of CARD_CAPS) for (const workCap of WORK_CAPS) for (const routerCap of routerCaps) {
    let precision = 0, recall = 0, elapsed = 0, tokens = 0, cost = 0, eligible = 0;
    for (const item of cases) {
      const started = performance.now();
      const { cards, works } = await candidates(item, cardCap, workCap);
      const cardIds = cards.map((row) => row.id);
      const workIds = works.map((row) => row.id);
      const expected = new Set([...item.cards, ...item.works]);
      if (expected.size === 0) continue; // no DB-linked card/work evidence to score
      let selected = [...cardIds, ...workIds];
      if (useRouter) {
        const index = ["CONCEPT CARDS:", ...cards.map((c) => `- card ${c.id} :: ${c.title} [${c.authorScope.join(", ")}]`), "WORKS:", ...works.map((w) => `- work ${w.id} :: ${w.title} (${w.author})`)].join("\n");
        const response = await chat("router", {
          system: `From the index, select at most ${routerCap} source entries needed to answer the question. Reply only JSON: {"items":[{"type":"card"|"work","id":"id from index"}]}.`,
          prompt: `${index}\n\nQuestion: ${item.question}`, json: true, maxTokens: 1500, temperature: 0,
        });
        const valid = new Set([...cardIds, ...workIds]);
        selected = parseRouterPicks(response.text).filter((pick) => valid.has(pick.id)).slice(0, routerCap).map((pick) => pick.id);
        tokens += response.inputTokens + response.outputTokens;
        cost += response.costUsd;
      }
      const found = new Set(selected.filter((id) => expected.has(id)));
      precision += selected.length === 0 ? 0 : found.size / selected.length;
      recall += found.size / expected.size;
      elapsed += performance.now() - started;
      eligible++;
    }
    const meanPrecision = precision / eligible;
    const meanRecall = recall / eligible;
    results.push({ config: `cards=${cardCap} works=${workCap}${useRouter ? ` router=${routerCap}` : ""}`, f1: f1(meanPrecision, meanRecall), precision: meanPrecision, recall: meanRecall, latencyMs: elapsed / eligible, tokens: tokens / eligible, cost: cost / eligible });
  }
  results.sort((a, b) => b.f1 - a.f1 || a.latencyMs - b.latencyMs);
  console.log("\nRanked configurations (macro metrics; 1 - precision is irrelevant-selection rate)");
  for (const r of results) console.log(`  ${r.config.padEnd(30)} F1 ${r.f1.toFixed(2)}  P ${r.precision.toFixed(2)}  R ${r.recall.toFixed(2)}  ${r.latencyMs.toFixed(0)}ms  ${r.tokens.toFixed(0)} tok  $${r.cost.toFixed(4)}`);
}

main().catch((error) => { console.error(error); process.exit(1); });
