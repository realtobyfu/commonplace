import { and, asc, eq, gt, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { LoopEvent } from "./loop";

/**
 * Durable storage for a conversation request and its emitted SSE frames.
 * The idempotency key is scoped to a workspace so a client retry can safely
 * reconnect without producing a second conversation exchange.
 */
export async function createOrGetTurn(input: {
  workspaceId: string;
  idempotencyKey: string;
  requestContent: string;
  approveLargeLoads: boolean;
}) {
  return await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(schema.conversationTurns)
      .values(input)
      .onConflictDoNothing()
      .returning();
    if (inserted[0]) return { turn: inserted[0], created: true };

    const turn = await tx.query.conversationTurns.findFirst({
      where: and(
        eq(schema.conversationTurns.workspaceId, input.workspaceId),
        eq(schema.conversationTurns.idempotencyKey, input.idempotencyKey),
      ),
    });
    if (!turn) throw new Error("Unable to load conversation turn after conflict.");
    if (turn.requestContent !== input.requestContent) {
      throw new TurnIdempotencyConflictError();
    }

    // The H5 approval is a continuation of the same durable request, not a
    // duplicate user message. Only an awaiting turn may be re-queued.
    if (input.approveLargeLoads && turn.status === "awaiting_approval") {
      const resumed = await tx
        .update(schema.conversationTurns)
        .set({
          approveLargeLoads: true,
          status: "pending",
          updatedAt: new Date(),
        })
        .where(eq(schema.conversationTurns.id, turn.id))
        .returning();
      return { turn: resumed[0]!, created: false };
    }
    return { turn, created: false };
  });
}

/** Claim a pending turn. Exactly one concurrent request can become executor. */
export async function claimTurn(turnId: string) {
  const rows = await db
    .update(schema.conversationTurns)
    .set({
      status: "planning",
      attempt: sql`${schema.conversationTurns.attempt} + 1`,
      updatedAt: new Date(),
      error: null,
    })
    .where(
      and(
        eq(schema.conversationTurns.id, turnId),
        eq(schema.conversationTurns.status, "pending"),
      ),
    )
    .returning();
  return rows[0] ?? null;
}

/** Append before sending: the sequence is the SSE resume cursor. */
export async function appendTurnEvent(turnId: string, event: LoopEvent) {
  return await db.transaction(async (tx) => {
    const updated = await tx
      .update(schema.conversationTurns)
      .set({
        nextEventSeq: sql`${schema.conversationTurns.nextEventSeq} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(schema.conversationTurns.id, turnId))
      .returning({
        sequence: sql<number>`${schema.conversationTurns.nextEventSeq} - 1`,
        attempt: schema.conversationTurns.attempt,
      });
    const cursor = updated[0];
    if (!cursor) throw new Error("Conversation turn no longer exists.");
    await tx.insert(schema.conversationTurnEvents).values({
      turnId,
      sequence: Number(cursor.sequence),
      type: event.type,
      payload: event,
    });
    return { sequence: Number(cursor.sequence), attempt: cursor.attempt };
  });
}

export async function turnEventsAfter(turnId: string, after = 0) {
  return await db.query.conversationTurnEvents.findMany({
    where: and(
      eq(schema.conversationTurnEvents.turnId, turnId),
      gt(schema.conversationTurnEvents.sequence, after),
    ),
    orderBy: asc(schema.conversationTurnEvents.sequence),
  });
}

export async function updateTurnStatus(
  turnId: string,
  status: "awaiting_approval" | "streaming" | "completed" | "failed",
  extras: { error?: string | null; userMessageId?: string; assistantMessageId?: string } = {},
) {
  await db
    .update(schema.conversationTurns)
    .set({
      status,
      ...extras,
      updatedAt: new Date(),
      ...(status === "completed" ? { completedAt: new Date() } : {}),
    })
    .where(eq(schema.conversationTurns.id, turnId));
}

export async function linkTurnMessage(
  turnId: string,
  field: "userMessageId" | "assistantMessageId",
  messageId: string,
) {
  await db
    .update(schema.conversationTurns)
    .set({ [field]: messageId, updatedAt: new Date() })
    .where(eq(schema.conversationTurns.id, turnId));
}

export class TurnIdempotencyConflictError extends Error {
  constructor() {
    super("This idempotency key belongs to a different message.");
  }
}
