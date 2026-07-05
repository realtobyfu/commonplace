import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

/**
 * One passage with its source metadata and any concept cards built on it —
 * what a provenance chip opens (§13.3: "clicking a chip opens the passage
 * and flashes its parent card in the panel").
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ passageId: string }> },
) {
  const { passageId } = await params;
  const rows = await db
    .select({
      passageId: schema.passages.id,
      ordinal: schema.passages.ordinal,
      heading: schema.passages.heading,
      text: schema.passages.text,
      workId: schema.passages.workId,
      workTitle: schema.works.title,
      author: schema.works.author,
    })
    .from(schema.passages)
    .innerJoin(schema.works, eq(schema.works.id, schema.passages.workId))
    .where(eq(schema.passages.id, passageId))
    .limit(1);
  const passage = rows[0];
  if (!passage) {
    return NextResponse.json({ error: "Unknown passage" }, { status: 404 });
  }

  const links = await db.query.cardPassages.findMany({
    where: eq(schema.cardPassages.passageId, passageId),
    columns: { cardId: true },
  });

  return NextResponse.json({
    ...passage,
    cardIds: links.map((l) => l.cardId),
  });
}
