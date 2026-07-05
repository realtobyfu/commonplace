import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { cardPassagesFor, workSummaries } from "@/lib/workspace/memoryStore";

/**
 * Drill-down data (§13.2: card → underlying passages → exact text). Returns
 * what the item actually contributes to context: a card's top passages, a
 * work-summary item's passage summaries, or the passage itself.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ itemType: string; itemId: string }> },
) {
  const { itemType, itemId } = await params;

  if (itemType === "card") {
    const passages = await cardPassagesFor(itemId);
    return NextResponse.json({
      items: passages.map((p) => ({
        passageId: p.id,
        ordinal: p.ordinal,
        heading: null,
        workTitle: p.workTitle,
        author: p.author,
        text: p.text,
      })),
    });
  }

  if (itemType === "work_summary") {
    const work = await db.query.works.findFirst({
      where: eq(schema.works.id, itemId),
    });
    if (!work) return NextResponse.json({ error: "Unknown work" }, { status: 404 });
    const summaries = await workSummaries(itemId);
    return NextResponse.json({
      items: summaries.map((s) => ({
        passageId: s.passageId,
        ordinal: s.ordinal,
        heading: null,
        workTitle: work.title,
        author: work.author,
        text: s.text,
      })),
    });
  }

  if (itemType === "passage") {
    const rows = await db
      .select({
        passageId: schema.passages.id,
        ordinal: schema.passages.ordinal,
        heading: schema.passages.heading,
        text: schema.passages.text,
        workTitle: schema.works.title,
        author: schema.works.author,
      })
      .from(schema.passages)
      .innerJoin(schema.works, eq(schema.works.id, schema.passages.workId))
      .where(eq(schema.passages.id, itemId))
      .limit(1);
    if (!rows[0]) return NextResponse.json({ error: "Unknown passage" }, { status: 404 });
    return NextResponse.json({ items: rows });
  }

  return NextResponse.json({ error: "Unknown item type" }, { status: 400 });
}
