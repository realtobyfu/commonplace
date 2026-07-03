import { NextResponse } from "next/server";
import { Client, Connection } from "@temporalio/client";
import { eq } from "drizzle-orm";
import { getPack } from "@/domain-packs";
import { db, schema } from "@/lib/db";

/**
 * POST /api/workspaces — create a workspace for a pack; kicks off the
 * ingestion workflow if the pack has no ingested works yet. Returns the
 * workspace and the ingest job id (empty when no ingestion was needed).
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { packId?: string };
  const packId = body.packId ?? "philosophy";

  let pack;
  try {
    pack = getPack(packId);
  } catch {
    return NextResponse.json({ error: `Unknown pack: ${packId}` }, { status: 400 });
  }

  const inserted = await db
    .insert(schema.workspaces)
    .values({ packId, promiseLine: pack.promiseLine })
    .returning();
  const workspace = inserted[0];
  if (!workspace) {
    return NextResponse.json({ error: "Workspace insert failed" }, { status: 500 });
  }

  const ingested = await db.query.works.findFirst({
    where: eq(schema.works.packId, packId),
  });
  const needsIngestion = !ingested || ingested.status !== "ingested";

  let ingestJobId: string | null = null;
  if (needsIngestion) {
    const connection = await Connection.connect({
      address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
    });
    const client = new Client({ connection });
    ingestJobId = `ingest-${packId}-${workspace.id}`;
    await client.workflow.start("ingestPack", {
      taskQueue: "commonplace",
      workflowId: ingestJobId,
      args: [{ packId, workspaceId: workspace.id }],
    });
  }

  return NextResponse.json({ workspace, ingestJobId });
}
