import { asc, eq, gt, sql, sum } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/ingest/:workspaceId/events — SSE stream powering the ingest
 * screen (§9.3). Two event types on one wire:
 *   milestone — one domain-language event row, sent as it appears
 *   snapshot  — works checklist + passage counts + running cost, every tick
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const workspace = await db.query.workspaces.findFirst({
    where: eq(schema.workspaces.id, workspaceId),
  });
  if (!workspace) {
    return new Response("Unknown workspace", { status: 404 });
  }
  const packId = workspace.packId;

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(
          encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      let lastEventAt = new Date(0);

      const tick = async () => {
        const fresh = await db.query.events.findMany({
          where: gt(schema.events.createdAt, lastEventAt),
          orderBy: asc(schema.events.createdAt),
        });
        for (const e of fresh.filter((e) => e.workspaceId === workspaceId)) {
          send("milestone", {
            kind: e.kind,
            message: e.domainMessage,
            traceId: e.otelTraceId,
            at: e.createdAt,
          });
        }
        const latest = fresh[fresh.length - 1];
        if (latest) lastEventAt = latest.createdAt;

        const works = await db
          .select({
            title: schema.works.title,
            author: schema.works.author,
            status: schema.works.status,
            passages: sql<number>`(select count(*) from passages where passages.work_id = works.id)`,
          })
          .from(schema.works)
          .where(eq(schema.works.packId, packId))
          .orderBy(asc(schema.works.author), asc(schema.works.title));

        const costRows = await db
          .select({ total: sum(schema.costs.costUsd) })
          .from(schema.costs)
          .where(eq(schema.costs.workspaceId, workspaceId));

        send("snapshot", {
          works,
          costUsd: Number(costRows[0]?.total ?? 0),
          done: works.length > 0 && works.every((w) => w.status === "ingested"),
        });
      };

      const interval = setInterval(() => {
        tick().catch(() => {
          /* transient DB hiccup — next tick retries */
        });
      }, 1500);
      await tick();

      const close = () => {
        closed = true;
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      _request.signal.addEventListener("abort", close);
    },
    cancel() {
      closed = true;
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
