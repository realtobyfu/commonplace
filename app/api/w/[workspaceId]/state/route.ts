import { NextResponse } from "next/server";
import { loadWorkspaceState } from "@/lib/workspace/state";

/** GET /api/w/:id/state — full workspace hydration on load (§12). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const state = await loadWorkspaceState(workspaceId);
  if (!state) {
    return NextResponse.json({ error: "Unknown workspace" }, { status: 404 });
  }
  return NextResponse.json(state);
}
