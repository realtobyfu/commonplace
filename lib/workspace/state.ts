import { asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { resolveSettings, type WorkspaceSettings } from "./settings";

/**
 * The full workspace hydration shape (§12 GET /api/w/:id/state): shelf index,
 * working set, budget, messages, starter prompts, settings. Shared by the API
 * route and the workspace page's server-side render, so both stay in lock step.
 */

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
    title: string;
    state: string;
    pinned: boolean;
    tokenCost: number;
    passageCount: number;
  }>;
  budget: { used: number; total: number };
  settings: WorkspaceSettings;
  messages: Array<{
    id: string;
    role: string;
    content: string;
    createdAt: string;
    provenance: Array<{
      passageId: string;
      author: string;
      workTitle: string;
      ordinal: number;
    }>;
  }>;
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

  const settings = resolveSettings(workspace.settings);

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

  const workingSetRows = await db.query.workingMemoryItems.findMany({
    where: eq(schema.workingMemoryItems.workspaceId, workspaceId),
  });
  const used = workingSetRows.reduce((sum, item) => sum + item.tokenCost, 0);

  const workingSet = await Promise.all(
    workingSetRows.map(async (item) => {
      let title = "";
      let passageCount = 0;
      if (item.itemType === "card") {
        const card = await db.query.conceptCards.findFirst({
          where: eq(schema.conceptCards.id, item.itemId),
        });
        title = card?.title ?? "(missing card)";
        const links = await db.query.cardPassages.findMany({
          where: eq(schema.cardPassages.cardId, item.itemId),
          columns: { passageId: true },
        });
        passageCount = links.length;
      } else if (item.itemType === "passage") {
        const rows = await db
          .select({
            ordinal: schema.passages.ordinal,
            workTitle: schema.works.title,
          })
          .from(schema.passages)
          .innerJoin(schema.works, eq(schema.works.id, schema.passages.workId))
          .where(eq(schema.passages.id, item.itemId))
          .limit(1);
        title = rows[0] ? `${rows[0].workTitle} §${rows[0].ordinal}` : "(missing passage)";
        passageCount = 1;
      } else {
        const work = await db.query.works.findFirst({
          where: eq(schema.works.id, item.itemId),
        });
        title = work ? `About ${work.title}` : "(missing work)";
      }
      return {
        itemType: item.itemType,
        itemId: item.itemId,
        title,
        state: item.state,
        pinned: item.pinned,
        tokenCost: item.tokenCost,
        passageCount,
      };
    }),
  );

  const messages = await db.query.messages.findMany({
    where: eq(schema.messages.workspaceId, workspaceId),
    orderBy: asc(schema.messages.createdAt),
  });

  const provenanceByMessage = new Map<
    string,
    Array<{ passageId: string; author: string; workTitle: string; ordinal: number }>
  >();
  if (messages.length > 0) {
    const provRows = await db
      .select({
        messageId: schema.messageProvenance.messageId,
        passageId: schema.passages.id,
        ordinal: schema.passages.ordinal,
        author: schema.works.author,
        workTitle: schema.works.title,
      })
      .from(schema.messageProvenance)
      .innerJoin(
        schema.passages,
        eq(schema.passages.id, schema.messageProvenance.passageId),
      )
      .innerJoin(schema.works, eq(schema.works.id, schema.passages.workId))
      .where(
        inArray(
          schema.messageProvenance.messageId,
          messages.map((m) => m.id),
        ),
      );
    for (const row of provRows) {
      const list = provenanceByMessage.get(row.messageId) ?? [];
      list.push({
        passageId: row.passageId,
        author: row.author,
        workTitle: row.workTitle,
        ordinal: row.ordinal,
      });
      provenanceByMessage.set(row.messageId, list);
    }
  }

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
    workingSet,
    budget: { used, total: settings.tokenBudget },
    settings,
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
      provenance: provenanceByMessage.get(m.id) ?? [],
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
