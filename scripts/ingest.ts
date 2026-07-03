/**
 * Trigger a pack ingestion from the CLI:
 *   pnpm tsx scripts/ingest.ts --pack philosophy
 *
 * Creates a workspace row and starts the ingestPack workflow directly
 * (same path the POST /api/workspaces handler takes).
 */
try {
  process.loadEnvFile(".env");
} catch {
  // no .env — defaults apply
}

import { parseArgs } from "node:util";
import { Client, Connection } from "@temporalio/client";
import { getPack } from "../domain-packs";
import { db, schema } from "../lib/db";

async function main() {
  const { values } = parseArgs({
    options: { pack: { type: "string", default: "philosophy" } },
  });
  const pack = getPack(values.pack ?? "philosophy");

  const inserted = await db
    .insert(schema.workspaces)
    .values({ packId: pack.id, promiseLine: pack.promiseLine })
    .returning();
  const workspace = inserted[0];
  if (!workspace) throw new Error("workspace insert failed");

  const connection = await Connection.connect({
    address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
  });
  const client = new Client({ connection });
  const workflowId = `ingest-${pack.id}-${workspace.id}`;
  await client.workflow.start("ingestPack", {
    taskQueue: "commonplace",
    workflowId,
    args: [{ packId: pack.id, workspaceId: workspace.id }],
  });

  console.log(`Ingestion started: ${workflowId}`);
  console.log(`Watch it: http://localhost:3000/ingest/${workspace.id}`);
  await connection.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
