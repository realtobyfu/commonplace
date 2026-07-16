/**
 * Backfill embeddings for passages whose `embedding` column is still NULL.
 * Ingestion (worker/activities/ingest.ts → embedWork) embeds passages as it
 * ingests, but passages ingested before Ollama was available carry no vector
 * and §11.4 retrieval falls back to a keyword scan. Run this once Ollama is up
 * to light up the pgvector semantic path (lib/workspace/loop.ts flips to cosine
 * nearest-neighbour the moment any passage has an embedding):
 *
 *   ollama pull nomic-embed-text
 *   pnpm tsx scripts/embed-backfill.ts
 *
 * Idempotent: only fills NULLs, so it's safe to re-run (after a crash, or after
 * ingesting a new pack). Passages are embedded from raw text — identical to the
 * ingestion path and to how the query is embedded in loop.ts — so backfilled,
 * freshly-ingested, and query vectors all share one comparable space. Batched
 * (the corpus is thousands of passages, unlike the handful of cards in
 * embed-cards.ts). Ollama only — no Temporal, no Groq.
 */
try {
  process.loadEnvFile(".env");
} catch {
  // no .env — defaults apply
}

import { asc, isNull, eq, sql } from "drizzle-orm";
import { db, schema } from "../lib/db";
import { embed } from "../lib/llm";

const BATCH_SIZE = 16;

async function main() {
  const totalRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.passages)
    .where(isNull(schema.passages.embedding));
  const remaining = Number(totalRows[0]?.count ?? 0);

  if (remaining === 0) {
    console.log("All passages already embedded — nothing to do.");
    process.exit(0);
  }
  console.log(`Embedding ${remaining} passages ...`);

  let embedded = 0;
  for (;;) {
    // Each pass fills the batch's NULLs, shrinking the remaining set until the
    // query returns nothing — so the loop terminates on its own.
    const batch = await db
      .select({ id: schema.passages.id, text: schema.passages.text })
      .from(schema.passages)
      .where(isNull(schema.passages.embedding))
      .orderBy(asc(schema.passages.id))
      .limit(BATCH_SIZE);
    if (batch.length === 0) break;

    const vectors = await embed(batch.map((p) => p.text));
    if (vectors === null) {
      console.error(
        "Ollama unreachable — could not embed. Start it (ollama serve) and " +
          "ensure nomic-embed-text is pulled, then re-run (idempotent).",
      );
      process.exit(1);
    }

    for (let i = 0; i < batch.length; i++) {
      const passage = batch[i];
      const vector = vectors[i];
      if (!passage || !vector) continue;
      await db
        .update(schema.passages)
        .set({ embedding: vector })
        .where(eq(schema.passages.id, passage.id));
      embedded++;
    }
    console.log(`  ${embedded}/${remaining}`);
  }

  console.log(`Done — embedded ${embedded} passages.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
