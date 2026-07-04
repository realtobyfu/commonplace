import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { resolveSettings, type WorkspaceSettings } from "@/lib/workspace/settings";

/**
 * PATCH /api/w/:id/settings — update the H3/H5 tunables (token budget,
 * staleness weighting, ask-before-large-load threshold). Values are merged
 * over current settings and clamped by resolveSettings before persisting.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const workspace = await db.query.workspaces.findFirst({
    where: eq(schema.workspaces.id, workspaceId),
  });
  if (!workspace) {
    return NextResponse.json({ error: "Unknown workspace" }, { status: 404 });
  }

  const patch = (await request.json().catch(() => ({}))) as Partial<WorkspaceSettings>;
  const current = resolveSettings(workspace.settings);
  const next = resolveSettings({ ...current, ...patch });

  await db
    .update(schema.workspaces)
    .set({ settings: next })
    .where(eq(schema.workspaces.id, workspaceId));

  return NextResponse.json({ settings: next });
}
