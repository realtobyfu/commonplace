import { count, desc, eq, sql } from "drizzle-orm";
import { packs } from "@/domain-packs";
import { db, schema } from "@/lib/db";

/**
 * The front door's data (app/page.tsx): every registered pack with its
 * shelf stats, and the workspaces already opened on it. Packs come from
 * the registry (a pack with nothing ingested still appears — that's the
 * invitation), counts come from the database.
 */

export interface HomeWorkspace {
  id: string;
  createdAt: string; // ISO
  messageCount: number;
  memoryCount: number;
  /** First thing the user asked — the workspace's de facto topic. */
  firstQuestion: string | null;
}

export interface HomePack {
  id: string;
  name: string;
  promiseLine: string;
  workLabel: string;
  authorLabel: string;
  ingestedWorks: number;
  totalWorks: number;
  passages: number;
  conceptCards: number;
  workspaces: HomeWorkspace[];
}

export async function loadHome(): Promise<HomePack[]> {
  const [workRows, passageRows, cardRows, workspaceRows] = await Promise.all([
    db
      .select({
        packId: schema.works.packId,
        status: schema.works.status,
        works: count(),
      })
      .from(schema.works)
      .groupBy(schema.works.packId, schema.works.status),
    db
      .select({ packId: schema.works.packId, passages: count() })
      .from(schema.passages)
      .innerJoin(schema.works, eq(schema.passages.workId, schema.works.id))
      .groupBy(schema.works.packId),
    db
      .select({ packId: schema.conceptCards.packId, cards: count() })
      .from(schema.conceptCards)
      .groupBy(schema.conceptCards.packId),
    db
      .select({
        id: schema.workspaces.id,
        packId: schema.workspaces.packId,
        createdAt: schema.workspaces.createdAt,
        // The outer column must be spelled table-qualified by hand:
        // interpolating ${schema.workspaces.id} inside a subquery renders
        // the unqualified "id", which resolves against the subquery's own
        // table instead of correlating with the outer row.
        messageCount: sql<number>`(select count(*)::int from ${schema.messages} m where m.workspace_id = workspaces.id)`,
        memoryCount: sql<number>`(select count(*)::int from ${schema.workingMemoryItems} w where w.workspace_id = workspaces.id)`,
        firstQuestion: sql<string | null>`(select m.content from ${schema.messages} m where m.workspace_id = workspaces.id and m.role = 'user' order by m.created_at asc limit 1)`,
      })
      .from(schema.workspaces)
      .orderBy(desc(schema.workspaces.createdAt)),
  ]);

  const passagesByPack = new Map(passageRows.map((r) => [r.packId, r.passages]));
  const cardsByPack = new Map(cardRows.map((r) => [r.packId, r.cards]));

  return Object.values(packs).map((pack) => {
    const packWorks = workRows.filter((r) => r.packId === pack.id);
    return {
      id: pack.id,
      name: pack.name,
      promiseLine: pack.promiseLine,
      workLabel: pack.vocabulary.workLabel,
      authorLabel: pack.vocabulary.authorLabel,
      ingestedWorks: packWorks
        .filter((r) => r.status === "ingested")
        .reduce((n, r) => n + r.works, 0),
      totalWorks: packWorks.reduce((n, r) => n + r.works, 0),
      passages: passagesByPack.get(pack.id) ?? 0,
      conceptCards: cardsByPack.get(pack.id) ?? 0,
      workspaces: workspaceRows
        .filter((w) => w.packId === pack.id)
        .map((w) => ({
          id: w.id,
          createdAt: w.createdAt.toISOString(),
          messageCount: w.messageCount,
          memoryCount: w.memoryCount,
          firstQuestion: w.firstQuestion,
        })),
    };
  });
}
