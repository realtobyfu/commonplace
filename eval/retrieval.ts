/**
 * Retrieval quality eval (offline) — keyword vs. semantic, on a golden set.
 *
 * Commonplace's §11.4 fallback retrieves passages two ways: a pgvector cosine
 * scan when embeddings exist, a keyword ILIKE scan when they don't. This eval
 * runs BOTH over the same golden questions (eval/golden.ts) and scores whether
 * each surfaces the author a good answer needs — turning "embeddings help" into
 * a number, and giving a regression net for future retrieval changes (prompt
 * tweaks, provider swaps, the search_document:/search_query: prefix refinement).
 *
 *   pnpm tsx eval/retrieval.ts          # top-K = 6 (matches loop.ts)
 *   pnpm tsx eval/retrieval.ts 10       # override K
 *
 * The two retrieval functions below MIRROR lib/workspace/loop.ts's
 * retrievalFallback deliberately — both branches pack-scoped. (The first run
 * of this eval caught the semantic branch missing its pack filter: on a
 * two-pack DB the other pack's passages contaminated the top-K. Fixed in
 * loop.ts; keep these mirrors in lockstep with any future retrieval change.)
 *
 * Metrics per mode:
 *   hit@K       fraction of questions with ≥1 expected author in the top K
 *   coverage    mean fraction of a question's expected authors that appear
 *   MRR         mean reciprocal rank of the first expected-author passage
 */
try {
  process.loadEnvFile(".env");
} catch {
  // no .env — defaults apply
}

import {
  and,
  asc,
  cosineDistance,
  eq,
  ilike,
  inArray,
  isNotNull,
  or,
} from "drizzle-orm";
import { db, schema } from "../lib/db";
import { embed } from "../lib/llm";
import { GOLDEN, type GoldenItem } from "./golden";

const DEFAULT_TOP_K = 6;

/** Mirror of loop.ts retrievalFallback, semantic branch. Pack-scoped. */
async function retrieveSemantic(packId: string, message: string, k: number): Promise<string[]> {
  const queryVec = (await embed([message]))?.[0];
  if (!queryVec) return []; // Ollama down / not embeddable
  const rows = await db
    .select({ passageId: schema.summaries.passageId })
    .from(schema.summaries)
    .innerJoin(schema.passages, eq(schema.passages.id, schema.summaries.passageId))
    .innerJoin(schema.works, eq(schema.works.id, schema.passages.workId))
    .where(
      and(
        eq(schema.works.packId, packId),
        isNotNull(schema.passages.embedding),
      ),
    )
    .orderBy(cosineDistance(schema.passages.embedding, queryVec))
    .limit(k);
  return rows.map((r) => r.passageId);
}

/** Mirror of loop.ts retrievalFallback, keyword branch. Pack-filtered. */
async function retrieveKeyword(packId: string, message: string, k: number): Promise<string[]> {
  const words = [...new Set(message.toLowerCase().match(/[a-z]{5,}/g) ?? [])]
    .sort((a, b) => b.length - a.length)
    .slice(0, 4);
  if (words.length === 0) return [];
  const rows = await db
    .select({ passageId: schema.summaries.passageId })
    .from(schema.summaries)
    .innerJoin(schema.passages, eq(schema.passages.id, schema.summaries.passageId))
    .innerJoin(schema.works, eq(schema.works.id, schema.passages.workId))
    .where(
      and(
        eq(schema.works.packId, packId),
        or(...words.map((w) => ilike(schema.summaries.text, `%${w}%`))),
      ),
    )
    .orderBy(asc(schema.passages.ordinal))
    .limit(k);
  return rows.map((r) => r.passageId);
}

/** passageId -> author, for scoring which thinker each retrieved passage belongs to. */
async function authorsFor(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: schema.passages.id, author: schema.works.author })
    .from(schema.passages)
    .innerJoin(schema.works, eq(schema.works.id, schema.passages.workId))
    .where(inArray(schema.passages.id, ids));
  return new Map(rows.map((r) => [r.id, r.author]));
}

interface Score {
  hit: boolean;
  coverage: number;
  reciprocalRank: number;
  passageHit: boolean;
  passageRecall: number;
  foundAuthors: string[];
}

function score(item: GoldenItem, orderedAuthors: string[], orderedPassageIds: string[]): Score {
  const expected = new Set(item.expectAuthors);
  const expectedPassages = new Set(item.relevantPassageIds);
  const found = orderedAuthors.filter((a) => expected.has(a));
  const covered = new Set(found);
  const rankIdx = orderedAuthors.findIndex((a) => expected.has(a));
  const foundPassages = new Set(
    orderedPassageIds.filter((id) => expectedPassages.has(id)),
  );
  return {
    hit: found.length > 0,
    coverage: covered.size / expected.size,
    reciprocalRank: rankIdx === -1 ? 0 : 1 / (rankIdx + 1),
    passageHit: foundPassages.size > 0,
    passageRecall: foundPassages.size / expectedPassages.size,
    foundAuthors: [...new Set(orderedAuthors)],
  };
}

async function runMode(
  item: GoldenItem,
  ids: string[],
): Promise<Score> {
  const map = await authorsFor(ids);
  const orderedAuthors = ids
    .map((id) => map.get(id))
    .filter((a): a is string => a !== undefined);
  return score(item, orderedAuthors, ids);
}

interface Agg {
  hit: number;
  coverage: number;
  mrr: number;
  passageHit: number;
  passageRecall: number;
  n: number;
}

function empty(): Agg {
  return { hit: 0, coverage: 0, mrr: 0, passageHit: 0, passageRecall: 0, n: 0 };
}
function add(a: Agg, s: Score): void {
  a.hit += s.hit ? 1 : 0;
  a.coverage += s.coverage;
  a.mrr += s.reciprocalRank;
  a.passageHit += s.passageHit ? 1 : 0;
  a.passageRecall += s.passageRecall;
  a.n += 1;
}
function pct(x: number, n: number): string {
  return n === 0 ? "  n/a" : `${((100 * x) / n).toFixed(0).padStart(3)}%`;
}
function num(x: number, n: number): string {
  return n === 0 ? " n/a" : (x / n).toFixed(2);
}

async function main() {
  const k = Number(process.argv[2] ?? DEFAULT_TOP_K) || DEFAULT_TOP_K;
  console.log(`\nRetrieval eval — ${GOLDEN.length} questions, top-K = ${k}\n`);
  console.log("  ✓ = ≥1 expected author retrieved · rank = position of first hit\n");
  console.log(
    "  " +
      "id".padEnd(24) +
      "kind".padEnd(12) +
      "keyword".padEnd(14) +
      "semantic",
  );
  console.log("  " + "-".repeat(58));

  const kw = { all: empty(), byKind: new Map<string, Agg>() };
  const se = { all: empty(), byKind: new Map<string, Agg>() };
  const bump = (m: Map<string, Agg>, kind: string, s: Score) => {
    const a = m.get(kind) ?? empty();
    add(a, s);
    m.set(kind, a);
  };

  for (const item of GOLDEN) {
    const kwIds = await retrieveKeyword(item.pack, item.question, k);
    const seIds = await retrieveSemantic(item.pack, item.question, k);
    const kwScore = await runMode(item, kwIds);
    const seScore = await runMode(item, seIds);

    add(kw.all, kwScore);
    add(se.all, seScore);
    bump(kw.byKind, item.kind, kwScore);
    bump(se.byKind, item.kind, seScore);

    const cell = (s: Score, ids: string[]) => {
      const mark = s.hit ? "✓" : "✗";
      const rank = s.hit ? `@${Math.round(1 / s.reciprocalRank)}` : ids.length === 0 ? "—" : " ·";
      const cov =
        item.expectAuthors.length > 1 ? ` ${Math.round(s.coverage * 100)}%` : "";
      return `${mark} ${rank}${cov}`.padEnd(14);
    };
    console.log(
      "  " +
        item.id.padEnd(24) +
        item.kind.padEnd(12) +
        cell(kwScore, kwIds) +
        cell(seScore, seIds),
    );
  }

  const line = (label: string, a: Agg, b: Agg) =>
    console.log(
      "  " +
        label.padEnd(14) +
        `keyword ${pct(a.hit, a.n)}`.padEnd(20) +
        `semantic ${pct(b.hit, b.n)}`,
    );

  console.log("\n  HIT@K BY KIND");
  for (const kind of ["single", "paraphrase", "cross"]) {
    line(`  ${kind}`, kw.byKind.get(kind) ?? empty(), se.byKind.get(kind) ?? empty());
  }

  console.log("\n  AGGREGATE                 keyword      semantic");
  console.log(
    `    hit@${k}                    ${pct(kw.all.hit, kw.all.n)}         ${pct(se.all.hit, se.all.n)}`,
  );
  console.log(
    `    author coverage         ${num(kw.all.coverage, kw.all.n)}          ${num(se.all.coverage, se.all.n)}`,
  );
  console.log(
    `    MRR                     ${num(kw.all.mrr, kw.all.n)}          ${num(se.all.mrr, se.all.n)}`,
  );
  console.log(
    `    exact passage hit@${k}    ${pct(kw.all.passageHit, kw.all.n)}         ${pct(se.all.passageHit, se.all.n)}`,
  );
  console.log(
    `    passage recall@${k}        ${num(kw.all.passageRecall, kw.all.n)}          ${num(se.all.passageRecall, se.all.n)}`,
  );
  console.log("");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
