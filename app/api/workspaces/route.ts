import { NextResponse } from "next/server";
import { Client, Connection } from "@temporalio/client";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getPack } from "@/domain-packs";
import { db, schema } from "@/lib/db";
import { isReadOnlyDemo } from "@/lib/env";

/**
 * POST /api/workspaces — create a workspace for a pack; kicks off the
 * ingestion workflow if the pack has no ingested works yet. Returns the
 * workspace and the ingest job id (empty when no ingestion was needed).
 */
export async function POST(request: Request) {
  if (isReadOnlyDemo()) {
    return NextResponse.json(
      { error: "This deployment is read-only — no ingestion worker runs behind it." },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { packId?: string };
  const packId = body.packId ?? "philosophy";

  let pack;
  try {
    pack = getPack(packId);
  } catch {
    return NextResponse.json({ error: `Unknown pack: ${packId}` }, { status: 400 });
  }

  // A read already in flight (works in a non-terminal status) means the one
  // thing to do is rejoin it — starting a second ingest workflow over the
  // same works would double the spend. Hand back the workspace running it
  // (the newest one without a pack_ready event, same rule as the worker's
  // boot-resume note) so the client lands on its ingest screen.
  const inFlight = await db.query.works.findFirst({
    where: and(
      eq(schema.works.packId, packId),
      inArray(schema.works.status, [
        "pending",
        "chunking",
        "summarizing",
        "embedding",
      ]),
    ),
  });
  if (inFlight) {
    const newest = await db.query.workspaces.findFirst({
      where: eq(schema.workspaces.packId, packId),
      orderBy: desc(schema.workspaces.createdAt),
    });
    if (newest) {
      const finished = await db.query.events.findFirst({
        where: and(
          eq(schema.events.workspaceId, newest.id),
          eq(schema.events.kind, "pack_ready"),
        ),
      });
      if (!finished) {
        return NextResponse.json({
          workspace: newest,
          ingestJobId: `ingest-${packId}-${newest.id}`,
        });
      }
    }
  }

  const ingested = await db.query.works.findFirst({
    where: eq(schema.works.packId, packId),
  });
  const needsIngestion = !ingested || ingested.status !== "ingested";

  // A fresh workspace on an already-ingested pack inherits the pack's
  // starter prompts (they're generated once, at the end of ingestion, and
  // stored on the workspace that ran it).
  let starterPrompts: unknown = null;
  if (!needsIngestion) {
    const previous = await db.query.workspaces.findMany({
      where: eq(schema.workspaces.packId, packId),
      orderBy: desc(schema.workspaces.createdAt),
      limit: 5,
    });
    starterPrompts =
      previous.find(
        (w) => Array.isArray(w.starterPrompts) && w.starterPrompts.length > 0,
      )?.starterPrompts ?? null;
  }

  const inserted = await db
    .insert(schema.workspaces)
    .values({ packId, promiseLine: pack.promiseLine, starterPrompts })
    .returning();
  const workspace = inserted[0];
  if (!workspace) {
    return NextResponse.json({ error: "Workspace insert failed" }, { status: 500 });
  }

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
