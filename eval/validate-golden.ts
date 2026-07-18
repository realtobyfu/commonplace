/**
 * Verify that a golden set is genuinely human-reviewable before using it to
 * tune retrieval. Golden fixtures intentionally store real database passage
 * UUIDs; this guard prevents a copied fixture or a re-ingest from silently
 * turning evaluation into author-name-only scoring.
 *
 *   pnpm tsx eval/validate-golden.ts
 *
 * It reports the current coverage but does not invent extra questions or IDs.
 * Additions must be reviewed by a person against the ingested corpus first.
 */
try {
  process.loadEnvFile(".env");
} catch {
  // DATABASE_URL can also be supplied by the shell.
}

import { eq, inArray } from "drizzle-orm";
import { db, schema } from "../lib/db";
import { GOLDEN } from "./golden";

async function main() {
  const ids = [...new Set(GOLDEN.flatMap((item) => item.relevantPassageIds))];
  const rows = ids.length === 0
    ? []
    : await db
        .select({ id: schema.passages.id, pack: schema.works.packId })
        .from(schema.passages)
        .innerJoin(schema.works, eq(schema.works.id, schema.passages.workId))
        .where(inArray(schema.passages.id, ids));
  const byId = new Map(rows.map((row) => [row.id, row.pack]));
  const errors: string[] = [];

  for (const item of GOLDEN) {
    if (item.relevantPassageIds.length === 0) {
      errors.push(`${item.id}: no reviewed supporting passages`);
      continue;
    }
    for (const passageId of item.relevantPassageIds) {
      const actualPack = byId.get(passageId);
      if (!actualPack) errors.push(`${item.id}: missing passage ${passageId}`);
      else if (actualPack !== item.pack) {
        errors.push(`${item.id}: passage ${passageId} belongs to ${actualPack}, expected ${item.pack}`);
      }
    }
  }

  const byPack = new Map<string, number>();
  for (const item of GOLDEN) byPack.set(item.pack, (byPack.get(item.pack) ?? 0) + 1);
  console.log("Golden fixture coverage");
  for (const [pack, count] of byPack) {
    console.log(`  ${pack.padEnd(18)} ${count} questions (target: 50–100)`);
  }
  console.log(`  distinct reviewed IDs ${rows.length}/${ids.length}`);

  if (errors.length > 0) {
    console.error("\nINVALID GOLDEN FIXTURE:");
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log("\nAll golden supporting passages exist in their declared pack.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
