/**
 * Provenance faithfulness eval (offline).
 *
 * Commonplace's provenance chips are the model's own self-report: after each
 * grounded claim it is asked to append a [[p:ID]] marker, which becomes a
 * clickable citation. Nothing checks that the cited passage actually supports
 * the claim, or that an uncited claim isn't ungrounded. This eval measures
 * both, turning "looks cited" into a number.
 *
 *   pnpm tsx eval/faithfulness.ts            # all workspaces
 *   pnpm tsx eval/faithfulness.ts <wsId>     # one workspace
 *
 * Method (an LLM-judge, ALCE/RAGAS-style — the 120b that writes answers grades
 * them). For each new assistant message we recover the exact hydrated passages
 * from message_context_passages, decompose the answer into atomic claims, and
 * judge each claim as supported / unsupported by that prompt evidence.
 *
 *   citation coverage   — fraction of answers carrying ≥1 citation at all
 *   groundedness        — supported claims / all claims (uncited answers hurt)
 *   faithfulness@cited  — supported / claims, over cited answers only
 *   citation precision  — cited passages that back ≥1 claim / cited passages
 *
 * Older messages predate message_context_passages and therefore have no
 * recoverable prompt snapshot. They are judged against no evidence rather than
 * silently treating every existing database passage as available.
 */
try {
  process.loadEnvFile(".env");
} catch {
  // no .env — defaults apply
}

import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "../lib/db";
import { chat } from "../lib/llm";

interface Verdict {
  claim: string;
  supported: boolean;
  passageIndex: number | null;
}

const JUDGE_SYSTEM = [
  "You audit whether an answer's claims are grounded in source passages supplied to the model.",
  "First decompose the ANSWER into its distinct, substantive factual claims",
  "about the thinkers/works (ignore pure framing, questions, and transitions).",
  "Then, for each claim, decide whether at least one PASSAGE below directly",
  "supports it. Mark supported=true ONLY on direct support, not mere topical",
  "overlap. passageIndex is the 1-based index of the supporting passage, or",
  "null when unsupported. If there are no passages, every claim is unsupported.",
  'Reply with strict JSON only: {"verdicts":[{"claim":string,"supported":boolean,"passageIndex":number|null}]}.',
].join("\n");

async function judgeMessage(
  answer: string,
  passages: Array<{ id: string; author: string; title: string; ordinal: number; text: string }>,
): Promise<Verdict[]> {
  const passageBlock =
    passages.length === 0
      ? "(no passages were supplied)"
      : passages
          .map(
            (p, i) =>
              `[${i + 1}] (${p.author}, ${p.title} §${p.ordinal})\n${p.text}`,
          )
          .join("\n\n");
  const result = await chat("eval_faithfulness", {
    system: JUDGE_SYSTEM,
    prompt: `ANSWER:\n${answer}\n\n===\nPASSAGES:\n${passageBlock}`,
    json: true,
    maxTokens: 2500,
    temperature: 0,
  });
  try {
    const parsed = JSON.parse(result.text) as { verdicts?: Verdict[] };
    return Array.isArray(parsed.verdicts) ? parsed.verdicts : [];
  } catch {
    return [];
  }
}

async function main() {
  const wsFilter = process.argv[2];
  const messages = await db.query.messages.findMany({
    where: wsFilter
      ? and(eq(schema.messages.role, "assistant"), eq(schema.messages.workspaceId, wsFilter))
      : eq(schema.messages.role, "assistant"),
    orderBy: desc(schema.messages.createdAt),
  });

  if (messages.length === 0) {
    console.log("No assistant messages to evaluate.");
    process.exit(0);
  }

  let totalClaims = 0;
  let supportedClaims = 0;
  let citedMessages = 0;
  let citedClaims = 0;
  let citedSupported = 0;
  let citedPassages = 0;
  let usefulPassages = 0;
  const rows: string[] = [];

  for (const msg of messages) {
    const citedRows = await db
      .select({ passageId: schema.messageProvenance.passageId })
      .from(schema.messageProvenance)
      .where(eq(schema.messageProvenance.messageId, msg.id));
    const citedPassageIds = new Set(citedRows.map((row) => row.passageId));

    const context = await db
      .select({
        id: schema.passages.id,
        ordinal: schema.passages.ordinal,
        text: schema.passages.text,
        author: schema.works.author,
        title: schema.works.title,
      })
      .from(schema.messageContextPassages)
      .innerJoin(schema.passages, eq(schema.passages.id, schema.messageContextPassages.passageId))
      .innerJoin(schema.works, eq(schema.works.id, schema.passages.workId))
      .where(eq(schema.messageContextPassages.messageId, msg.id));

    const verdicts = await judgeMessage(msg.content, context);
    const n = verdicts.length;
    const s = verdicts.filter((v) => v.supported).length;
    totalClaims += n;
    supportedClaims += s;

    const hasCitations = citedPassageIds.size > 0;
    if (hasCitations) {
      citedMessages++;
      citedClaims += n;
      citedSupported += s;
      citedPassages += citedPassageIds.size;
      const backed = new Set(
        verdicts
          .filter((v) => v.supported && v.passageIndex != null)
          .map((v) => context[(v.passageIndex ?? 0) - 1]?.id)
          .filter((id): id is string => id !== undefined && citedPassageIds.has(id)),
      );
      usefulPassages += backed.size;
    }

    const tag = hasCitations ? `${citedPassageIds.size}📎` : "0📎";
    const rate = n > 0 ? `${s}/${n}` : "—";
    rows.push(
      `  ${tag.padStart(4)}  grounded ${rate.padStart(5)}  ${msg.content.replace(/\s+/g, " ").slice(0, 58)}`,
    );
  }

  const pct = (a: number, b: number) => (b === 0 ? "n/a" : `${((100 * a) / b).toFixed(0)}%`);

  console.log("\nPER-ANSWER  (📎 = citations, grounded = supported/total claims)");
  for (const r of rows) console.log(r);

  console.log("\nAGGREGATE");
  console.log(`  answers evaluated       ${messages.length}`);
  console.log(`  citation coverage       ${pct(citedMessages, messages.length)}  (${citedMessages}/${messages.length} carry any citation)`);
  console.log(`  groundedness (all)      ${pct(supportedClaims, totalClaims)}  (${supportedClaims}/${totalClaims} claims backed by prompt evidence)`);
  console.log(`  faithfulness@cited      ${pct(citedSupported, citedClaims)}  (prompt-grounded claims, over ${citedMessages} cited answers)`);
  console.log(`  citation precision      ${pct(usefulPassages, citedPassages)}  (${usefulPassages}/${citedPassages} cited passages back a claim)`);
  console.log("");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
