/** Normalize existing work orientation notes to the same 60-token cap used at ingestion. */
try {
  process.loadEnvFile(".env");
} catch {
  // Defaults remain useful for local development.
}

import { eq, isNotNull } from "drizzle-orm";
import { db, schema } from "../lib/db";
import { capOrientationSummary } from "../lib/workspace/orientation";

async function main() {
  const works = await db
    .select({ id: schema.works.id, orientationSummary: schema.works.orientationSummary })
    .from(schema.works)
    .where(isNotNull(schema.works.orientationSummary));
  let changed = 0;
  for (const work of works) {
    const capped = capOrientationSummary(work.orientationSummary ?? "");
    if (capped === work.orientationSummary) continue;
    await db.update(schema.works).set({ orientationSummary: capped }).where(eq(schema.works.id, work.id));
    changed++;
  }
  console.log(`Normalized ${changed} of ${works.length} work orientation notes.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
