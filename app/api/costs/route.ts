import { NextResponse } from "next/server";
import { count, desc, sum } from "drizzle-orm";
import { db, schema } from "@/lib/db";

/**
 * GET /api/costs (§15) — settings drawer cost meter data: total spend vs
 * the MAX_SPEND_USD hard stop, a per-job breakdown, and a per-workspace
 * breakdown.
 */

const DEFAULT_MAX_SPEND_USD = 25;

export async function GET() {
  const capUsd = Number(process.env.MAX_SPEND_USD ?? DEFAULT_MAX_SPEND_USD);

  const totalRows = await db
    .select({ total: sum(schema.costs.costUsd) })
    .from(schema.costs);
  const totalUsd = Number(totalRows[0]?.total ?? 0);

  const byJobRows = await db
    .select({
      job: schema.costs.job,
      calls: count(schema.costs.id),
      inputTokens: sum(schema.costs.inputTokens),
      outputTokens: sum(schema.costs.outputTokens),
      costUsd: sum(schema.costs.costUsd),
    })
    .from(schema.costs)
    .groupBy(schema.costs.job)
    .orderBy(desc(sum(schema.costs.costUsd)));

  const byJob = byJobRows.map((r) => ({
    job: r.job,
    calls: Number(r.calls ?? 0),
    inputTokens: Number(r.inputTokens ?? 0),
    outputTokens: Number(r.outputTokens ?? 0),
    costUsd: Number(r.costUsd ?? 0),
  }));

  const byWorkspaceRows = await db
    .select({
      workspaceId: schema.costs.workspaceId,
      costUsd: sum(schema.costs.costUsd),
    })
    .from(schema.costs)
    .groupBy(schema.costs.workspaceId);

  const byWorkspace = byWorkspaceRows
    .filter((r) => r.workspaceId !== null)
    .map((r) => ({
      workspaceId: r.workspaceId as string,
      costUsd: Number(r.costUsd ?? 0),
    }));

  return NextResponse.json({ totalUsd, capUsd, byJob, byWorkspace });
}
