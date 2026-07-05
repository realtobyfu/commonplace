import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

/**
 * GET /api/w/:id/timeline (§14) — the in-product activity timeline.
 * Merges events (router decisions, synthesis milestones, etc.) and
 * memory_ops (hydrate/evict/pin/unpin) into one newest-first feed so the
 * panel can render "what did it just do" without exposing raw kind
 * strings as primary text.
 */

const ENTRY_LIMIT = 60;

interface TimelineEntry {
  source: "event" | "memory_op";
  kind: string;
  message: string;
  actor?: "agent" | "user";
  traceId: string | null;
  at: string;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;

  const [events, memoryOps] = await Promise.all([
    db.query.events.findMany({
      where: eq(schema.events.workspaceId, workspaceId),
      orderBy: desc(schema.events.createdAt),
      limit: ENTRY_LIMIT,
    }),
    db.query.memoryOps.findMany({
      where: eq(schema.memoryOps.workspaceId, workspaceId),
      orderBy: desc(schema.memoryOps.createdAt),
      limit: ENTRY_LIMIT,
    }),
  ]);

  const entries: TimelineEntry[] = [
    ...events.map((e) => ({
      source: "event" as const,
      kind: e.kind,
      message: e.domainMessage,
      traceId: e.otelTraceId,
      at: e.createdAt.toISOString(),
    })),
    ...memoryOps.map((m) => ({
      source: "memory_op" as const,
      kind: m.op,
      message: m.reason,
      actor: m.actor,
      traceId: null,
      at: m.createdAt.toISOString(),
    })),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, ENTRY_LIMIT);

  return NextResponse.json({ entries });
}
