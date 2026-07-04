import { runConversationTurn, type LoopEvent } from "@/lib/workspace/loop";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/w/:id/messages (§12) — one SSE stream, typed events: the panel
 * animates off memory_op frames while the conversation streams answer_delta
 * frames from the same wire.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const body = (await request.json().catch(() => ({}))) as { content?: string };
  const content = body.content?.trim();
  if (!content) {
    return new Response(JSON.stringify({ error: "Empty message" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: LoopEvent) => {
        controller.enqueue(
          encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`),
        );
      };
      try {
        await runConversationTurn({ workspaceId, message: content, emit });
      } catch (err) {
        emit({
          type: "error",
          message: err instanceof Error ? err.message : "Something went wrong.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
}
