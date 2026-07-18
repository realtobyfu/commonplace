/** Generate configured concept seeds that do not yet have a card. */
try {
  process.loadEnvFile(".env");
} catch {
  // Defaults remain useful for local development.
}

import { desc, eq } from "drizzle-orm";
import { db, schema } from "../lib/db";
import { synthesizeConceptCards } from "../worker/activities/ingest";

async function main() {
  for (const packId of ["philosophy", "swift-evolution"]) {
    const workspace = await db.query.workspaces.findFirst({
      where: eq(schema.workspaces.packId, packId),
      orderBy: desc(schema.workspaces.createdAt),
    });
    if (!workspace) {
      console.warn(`Skipped ${packId}: no workspace exists.`);
      continue;
    }
    const result = await synthesizeConceptCards({
      packId,
      workspaceId: workspace.id,
    });
    console.log(`${packId}: created ${result.cards} concept cards.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
