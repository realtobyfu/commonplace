/**
 * Re-start an ingestPack workflow for an existing workspace (after a failed
 * run — every activity is idempotent, so a re-run resumes where data left
 * off):  pnpm tsx scripts/reingest.ts --pack swift-evolution --workspace <id>
 */
try {
  process.loadEnvFile(".env");
} catch {
  // defaults apply
}

import { parseArgs } from "node:util";
import { Client, Connection } from "@temporalio/client";

async function main() {
  const { values } = parseArgs({
    options: {
      pack: { type: "string" },
      workspace: { type: "string" },
    },
  });
  if (!values.pack || !values.workspace) {
    console.error("usage: pnpm tsx scripts/reingest.ts --pack <id> --workspace <id>");
    process.exit(1);
  }

  const connection = await Connection.connect({
    address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
  });
  const client = new Client({ connection });
  const workflowId = `ingest-${values.pack}-${values.workspace}-retry-${Date.now()}`;
  await client.workflow.start("ingestPack", {
    taskQueue: "commonplace",
    workflowId,
    args: [{ packId: values.pack, workspaceId: values.workspace }],
  });
  console.log(`Restarted: ${workflowId}`);
  await connection.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
