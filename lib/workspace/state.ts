import { asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

/**
 * The full workspace hydration shape (§12 GET /api/w/:id/state): shelf index,
 * working set, budget, messages, starter prompts. Shared by the API route
 * and the workspace page's server-side render, so both stay in lock step.
 */

export const DEFAULT_TOKEN_BUDGET = 80_000;

export interface ShelfWork {
  id: string;
  author: string;
  title: string;
  status: string;
  passageCount: number;
}

export interface WorkspaceState {
  workspace: {
    id: string;
    packId: string;
    promiseLine: string;
    starterPrompts: Array<{ prompt: string; behavior: string }>;
  };
  shelf: ShelfWork[];
  workingSet: Array<{
    itemType: string;
    itemId: string;
    state: string;
    pinned: boolean;
    tokenCost: number;
  }>;
  budget: { used: number; total: number };
  messages: Array<{ id: string; role: string; content: string; createdAt: string }>;
  recentOps: Array<{ op: string; reason: string; createdAt: string }>;
  ingestion: { done: boolean; totalWorks: number; ingestedWorks: number };
}

export async function loadWorkspaceState(
  workspaceId: string,
): Promise<WorkspaceState | null> {
  const workspace = await db.query.workspaces.findFirst({
    where: eq(schema.workspaces.id, workspaceId),
  });
  if (!workspace) return null;

  const works = await db.query.works.findMany({
    where: eq(schema.works.packId, workspace.packId),
    orderBy: [asc(schema.works.author), asc(schema.works.title)],
  });

  const shelf: ShelfWork[] = await Promise.all(
    works.map(async (w) => {
      const rows = await db.query.passages.findMany({
        where: eq(schema.passages.workId, w.id),
        columns: { id: true },
      });
      return {
        id: w.id,
        author: w.author,
        title: w.title,
        status: w.status,
        passageCount: rows.length,
      };
    }),
  );

  const workingSet = await db.query.workingMemoryItems.findMany({
    where: eq(schema.workingMemoryItems.workspaceId, workspaceId),
  });
  const used = workingSet.reduce((sum, item) => sum + item.tokenCost, 0);

  const messages = await db.query.messages.findMany({
    where: eq(schema.messages.workspaceId, workspaceId),
    orderBy: asc(schema.messages.createdAt),
  });

  const recentOpsRows = await db.query.memoryOps.findMany({
    where: eq(schema.memoryOps.workspaceId, workspaceId),
    orderBy: desc(schema.memoryOps.createdAt),
    limit: 6,
  });

  const starterPrompts = Array.isArray(workspace.starterPrompts)
    ? (workspace.starterPrompts as Array<{ prompt: string; behavior: string }>)
    : [];

  return {
    workspace: {
      id: workspace.id,
      packId: workspace.packId,
      promiseLine: workspace.promiseLine,
      starterPrompts,
    },
    shelf,
    workingSet: workingSet.map((i) => ({
      itemType: i.itemType,
      itemId: i.itemId,
      state: i.state,
      pinned: i.pinned,
      tokenCost: i.tokenCost,
    })),
    budget: { used, total: DEFAULT_TOKEN_BUDGET },
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    })),
    recentOps: recentOpsRows.map((o) => ({
      op: o.op,
      reason: o.reason,
      createdAt: o.createdAt.toISOString(),
    })),
    ingestion: {
      done: works.length > 0 && works.every((w) => w.status === "ingested"),
      totalWorks: works.length,
      ingestedWorks: works.filter((w) => w.status === "ingested").length,
    },
  };
}
