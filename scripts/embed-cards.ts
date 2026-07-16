/**
 * Backfill embeddings for concept cards whose `embedding` column is still
 * NULL. Card synthesis (worker/activities/ingest.ts → synthesizeConceptCards)
 * embeds each card as it writes it, but cards created before the embedding
 * column existed carry no vector. Run this once Ollama is up to light up
 * embedding-based routing and relevance-weighted eviction:
 *
 *   ollama pull nomic-embed-text
 *   pnpm tsx scripts/embed-cards.ts
 *
 * Idempotent: only fills NULLs, so it's safe to re-run. The embedding text is
 * `${title}\n\n${body}` — identical to the synthesis path — so backfilled and
 * freshly-synthesized cards land in one comparable space. Ollama only.
 */
try {
  process.loadEnvFile(".env");
} catch {
  // no .env — defaults apply
}

import { isNull, eq } from "drizzle-orm";
import { db, schema } from "../lib/db";
import { embed } from "../lib/llm";

async function main() {
  const cards = await db
    .select({
      id: schema.conceptCards.id,
      title: schema.conceptCards.title,
      body: schema.conceptCards.body,
    })
    .from(schema.conceptCards)
    .where(isNull(schema.conceptCards.embedding));

  if (cards.length === 0) {
    console.log("All concept cards already embedded — nothing to do.");
    process.exit(0);
  }
  console.log(`Embedding ${cards.length} concept cards ...`);

  const vectors = await embed(cards.map((c) => `${c.title}\n\n${c.body}`));
  if (vectors === null) {
    console.error(
      "Ollama unreachable — could not embed. Start it (ollama serve) and " +
        "ensure nomic-embed-text is pulled, then re-run.",
    );
    process.exit(1);
  }

  let embedded = 0;
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const vector = vectors[i];
    if (!card || !vector) continue;
    await db
      .update(schema.conceptCards)
      .set({ embedding: vector })
      .where(eq(schema.conceptCards.id, card.id));
    embedded++;
    console.log(`  ${embedded}/${cards.length}  ${card.title}`);
  }

  console.log(`Done — embedded ${embedded} concept cards.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
