import { runConversationTurn, type LoopEvent } from "@/lib/workspace/loop";
import {
  appendTurnEvent,
  claimTurn,
  createOrGetTurn,
  linkTurnMessage,
  TurnIdempotencyConflictError,
  turnEventsAfter,
  updateTurnStatus,
} from "@/lib/workspace/turnStore";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/w/:id/messages — an idempotent, replayable SSE turn. Frames are
 * persisted before they cross the wire; their `id:` is the resume cursor.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    content?: string;
    approveLargeLoads?: boolean;
    idempotencyKey?: string;
  };
  const content = body.content?.trim();
  if (!content) {
    return Response.json({ error: "Empty message" }, { status: 400 });
  }

  // Existing API consumers still work, but clients that want retry safety
  // should provide this value (WorkspaceShell does).
  const idempotencyKey =
    request.headers.get("idempotency-key") ?? body.idempotencyKey ?? crypto.randomUUID();
  if (idempotencyKey.length > 200) {
    return Response.json({ error: "Invalid idempotency key" }, { status: 400 });
  }

  let result;
  try {
    result = await createOrGetTurn({
      workspaceId,
      idempotencyKey,
      requestContent: content,
      approveLargeLoads: body.approveLargeLoads === true,
    });
  } catch (err) {
    if (err instanceof TurnIdempotencyConflictError) {
      return Response.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }

  const claimed = await claimTurn(result.turn.id);
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let cursor = Number(request.headers.get("last-event-id") ?? 0) || 0;
      // Approval continues an interrupted turn. Its old interrupt frame is
      // history, not a new request to interrupt the just-approved client.
      if (body.approveLargeLoads === true && !request.headers.get("last-event-id")) {
        cursor = result.turn.nextEventSeq - 1;
      }
      const write = (event: LoopEvent, sequence: number, attempt: number) => {
        cursor = sequence;
        controller.enqueue(
          encoder.encode(
            `id: ${sequence}\nevent: ${event.type}\ndata: ${JSON.stringify({
              ...event,
              sequence,
              attempt,
              turnId: result.turn.id,
            })}\n\n`,
          ),
        );
      };

      try {
        // A retry first sees everything it missed. If another request already
        // owns execution, this is a bounded replay rather than duplicate work.
        const prior = await turnEventsAfter(result.turn.id, cursor);
        for (const event of prior) {
          write(event.payload as LoopEvent, event.sequence, claimed?.attempt ?? result.turn.attempt);
        }
        if (!claimed) return;

        let streamingMarked = false;
        const emit = async (event: LoopEvent) => {
          if (event.type === "interrupt") {
            await updateTurnStatus(result.turn.id, "awaiting_approval");
          } else if (event.type === "answer_delta" && !streamingMarked) {
            streamingMarked = true;
            await updateTurnStatus(result.turn.id, "streaming");
          } else if (event.type === "done") {
            await updateTurnStatus(result.turn.id, "completed", {
              assistantMessageId: event.messageId,
            });
          } else if (event.type === "error") {
            await updateTurnStatus(result.turn.id, "failed", { error: event.message });
          }
          const persisted = await appendTurnEvent(result.turn.id, event);
          write(event, persisted.sequence, persisted.attempt);
        };

        await runConversationTurn({
          workspaceId,
          message: content,
          approveLargeLoads: body.approveLargeLoads === true,
          emit,
          onUserMessage: (messageId) => linkTurnMessage(result.turn.id, "userMessageId", messageId),
          onAssistantMessage: (messageId) =>
            linkTurnMessage(result.turn.id, "assistantMessageId", messageId),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Something went wrong.";
        await updateTurnStatus(result.turn.id, "failed", { error: message });
        const persisted = await appendTurnEvent(result.turn.id, { type: "error", message });
        write({ type: "error", message }, persisted.sequence, persisted.attempt);
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
      "x-conversation-turn-id": result.turn.id,
    },
  });
}
