/**
 * Generate orientation notes for works ingested before the orientation_summary
 * column existed. This is intentionally opt-in: it makes one inexpensive LLM
 * call per missing work and records the normal per-workspace cost.
 *
 *   npm run backfill-work-orientations
 *
 * Idempotent: only works with a NULL orientation_summary are selected.
 */
try {
  process.loadEnvFile(".env");
} catch {
  // Defaults remain useful for local development.
}

import { asc, desc, eq, isNull } from "drizzle-orm";
import { db, schema } from "../lib/db";
import { summarizeWorkOrientation } from "../worker/activities/ingest";

async function main() {
  const works = await db
    .select({ id: schema.works.id, packId: schema.works.packId, title: schema.works.title })
    .from(schema.works)
    .where(isNull(schema.works.orientationSummary))
    .orderBy(asc(schema.works.packId), asc(schema.works.title));

  if (works.length === 0) {
    console.log("All works already have orientation notes — nothing to do.");
    return;
  }

  console.log(`Generating orientation notes for ${works.length} works ...`);
  let created = 0;
  for (const work of works) {
    // Cost records and events belong to the most recently created workspace
    // using this pack, matching the ingestion workflow's ownership model.
    const workspace = await db.query.workspaces.findFirst({
      where: eq(schema.workspaces.packId, work.packId),
      orderBy: desc(schema.workspaces.createdAt),
    });
    if (!workspace) {
      console.warn(`  Skipped ${work.title}: no workspace exists for pack ${work.packId}.`);
      continue;
    }
    const result = await summarizeWorkOrientation({
      workId: work.id,
      workspaceId: workspace.id,
      packId: work.packId,
    });
    if (result.created) created++;
    console.log(`  ${created}/${works.length}  ${work.title}`);
  }

  console.log(`Done — generated ${created} orientation notes.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
