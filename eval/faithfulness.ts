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
 * them). For each assistant message we recover its cited passages from
 * message_provenance, decompose the answer into atomic claims, and judge each
 * claim as supported / unsupported by those passages. Reported metrics:
 *
 *   citation coverage   — fraction of answers carrying ≥1 citation at all
 *   groundedness        — supported claims / all claims (uncited answers hurt)
 *   faithfulness@cited  — supported / claims, over cited answers only
 *   citation precision  — cited passages that back ≥1 claim / cited passages
 *
 * Limitation, stated honestly: the stored answer has had its [[p:ID]] markers
 * stripped, and we never persisted the full working set per message — so a
 * claim can only be checked against the passages that were *cited*, not
 * everything the model saw. An uncited-but-true claim therefore reads as a
 * coverage gap (missing chip), which is exactly the provenance failure worth
 * surfacing.
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
  "You audit whether an answer's claims are grounded in cited source passages.",
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
  passages: Array<{ author: string; title: string; ordinal: number; text: string }>,
): Promise<Verdict[]> {
  const passageBlock =
    passages.length === 0
      ? "(no passages were cited)"
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
    const prov = await db
      .select({
        ordinal: schema.passages.ordinal,
        text: schema.passages.text,
        author: schema.works.author,
        title: schema.works.title,
      })
      .from(schema.messageProvenance)
      .innerJoin(schema.passages, eq(schema.passages.id, schema.messageProvenance.passageId))
      .innerJoin(schema.works, eq(schema.works.id, schema.passages.workId))
      .where(eq(schema.messageProvenance.messageId, msg.id));

    const verdicts = await judgeMessage(msg.content, prov);
    const n = verdicts.length;
    const s = verdicts.filter((v) => v.supported).length;
    totalClaims += n;
    supportedClaims += s;

    const hasCitations = prov.length > 0;
    if (hasCitations) {
      citedMessages++;
      citedClaims += n;
      citedSupported += s;
      citedPassages += prov.length;
      const backed = new Set(
        verdicts
          .filter((v) => v.supported && v.passageIndex != null)
          .map((v) => v.passageIndex),
      );
      usefulPassages += [...backed].filter(
        (i) => typeof i === "number" && i >= 1 && i <= prov.length,
      ).length;
    }

    const tag = hasCitations ? `${prov.length}📎` : "0📎";
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
  console.log(`  groundedness (all)      ${pct(supportedClaims, totalClaims)}  (${supportedClaims}/${totalClaims} claims backed by a citation)`);
  console.log(`  faithfulness@cited      ${pct(citedSupported, citedClaims)}  (over the ${citedMessages} cited answers)`);
  console.log(`  citation precision      ${pct(usefulPassages, citedPassages)}  (${usefulPassages}/${citedPassages} cited passages back a claim)`);
  console.log("");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
