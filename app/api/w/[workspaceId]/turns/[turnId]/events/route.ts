import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { turnEventsAfter } from "@/lib/workspace/turnStore";

/** Replay durable frames after an SSE cursor following a reconnect. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string; turnId: string }> },
) {
  const { workspaceId, turnId } = await params;
  const turn = await db.query.conversationTurns.findFirst({
    where: and(
      eq(schema.conversationTurns.id, turnId),
      eq(schema.conversationTurns.workspaceId, workspaceId),
    ),
    columns: { id: true, attempt: true },
  });
  if (!turn) return Response.json({ error: "Unknown conversation turn" }, { status: 404 });

  const after = Math.max(0, Number(new URL(request.url).searchParams.get("after") ?? 0) || 0);
  const rows = await turnEventsAfter(turnId, after);
  const encoder = new TextEncoder();
  const body = rows
    .map(
      (event) =>
        `id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify({
          ...(event.payload as object),
          sequence: event.sequence,
          attempt: turn.attempt,
          turnId,
        })}\n\n`,
    )
    .join("");
  return new Response(encoder.encode(body), {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
    },
  });
}
