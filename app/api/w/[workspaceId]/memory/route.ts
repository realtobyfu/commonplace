import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { manualEvict, manualHydrate, pin, unpin, type ItemType } from "@/lib/memory";
import {
  buildRequiredItem,
  loadWorkingSet,
  persistPlan,
} from "@/lib/workspace/memoryStore";
import { resolveSettings } from "@/lib/workspace/settings";

/**
 * POST /api/w/:id/memory (§12) — user memory ops. Pins are inviolable to the
 * agent; manual evict/hydrate go through the same pure module the agent
 * uses, so the audit log and panel feed stay uniform.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    op?: "pin" | "unpin" | "evict" | "hydrate";
    itemType?: ItemType;
    itemId?: string;
  };
  if (!body.op || !body.itemType || !body.itemId) {
    return NextResponse.json({ error: "op, itemType, itemId required" }, { status: 400 });
  }

  const workspace = await db.query.workspaces.findFirst({
    where: eq(schema.workspaces.id, workspaceId),
  });
  if (!workspace) {
    return NextResponse.json({ error: "Unknown workspace" }, { status: 404 });
  }
  const settings = resolveSettings(workspace.settings);
  const currentSet = await loadWorkingSet(workspaceId);
  const target = { itemType: body.itemType, itemId: body.itemId };

  if (body.op === "hydrate") {
    const requiredItem = await buildRequiredItem(body.itemType, body.itemId);
    if (!requiredItem) {
      return NextResponse.json({ error: "Unknown item" }, { status: 404 });
    }
    const turnRows = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.messages)
      .where(
        and(
          eq(schema.messages.workspaceId, workspaceId),
          eq(schema.messages.role, "user"),
        ),
      );
    const result = manualHydrate({
      currentSet,
      target: requiredItem,
      budgetTokens: settings.tokenBudget,
      currentTurn: Number(turnRows[0]?.count ?? 0),
      stalenessWeight: settings.stalenessWeight,
    });
    await persistPlan({
      workspaceId,
      nextSet: result.nextSet,
      ops: result.ops,
      actor: "user",
    });
    return NextResponse.json({ ops: result.ops, overBudget: result.overBudget });
  }

  const result =
    body.op === "pin"
      ? pin(currentSet, target)
      : body.op === "unpin"
        ? unpin(currentSet, target)
        : manualEvict(currentSet, target);

  await persistPlan({
    workspaceId,
    nextSet: result.nextSet,
    ops: result.op ? [result.op] : [],
    actor: "user",
  });
  return NextResponse.json({ ops: result.op ? [result.op] : [] });
}
