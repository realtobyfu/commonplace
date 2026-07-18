import { NextResponse } from "next/server";
import { count, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

/** All concept cards in a workspace's pack, annotated with live memory state. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const workspace = await db.query.workspaces.findFirst({
    where: eq(schema.workspaces.id, workspaceId),
  });
  if (!workspace) {
    return NextResponse.json({ error: "Unknown workspace" }, { status: 404 });
  }

  const [cards, memory] = await Promise.all([
    db
      .select({
        id: schema.conceptCards.id,
        title: schema.conceptCards.title,
        body: schema.conceptCards.body,
        authorScope: schema.conceptCards.authorScope,
        passageCount: count(schema.cardPassages.passageId),
      })
      .from(schema.conceptCards)
      .leftJoin(
        schema.cardPassages,
        eq(schema.cardPassages.cardId, schema.conceptCards.id),
      )
      .where(eq(schema.conceptCards.packId, workspace.packId))
      .groupBy(
        schema.conceptCards.id,
        schema.conceptCards.title,
        schema.conceptCards.body,
        schema.conceptCards.authorScope,
      )
      .orderBy(schema.conceptCards.title),
    db.query.workingMemoryItems.findMany({
      where: eq(schema.workingMemoryItems.workspaceId, workspaceId),
      columns: { itemId: true, itemType: true, state: true, pinned: true },
    }),
  ]);

  const memoryByCard = new Map(
    memory
      .filter((item) => item.itemType === "card")
      .map((item) => [item.itemId, { state: item.state, pinned: item.pinned }]),
  );
  return NextResponse.json({
    cards: cards.map((card) => ({
      ...card,
      passageCount: Number(card.passageCount),
      memory: memoryByCard.get(card.id) ?? null,
    })),
  });
}
