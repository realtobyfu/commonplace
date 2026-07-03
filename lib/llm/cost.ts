import { sum } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { JobKind } from "./routing";

const DEFAULT_MAX_SPEND_USD = 25;

export class SpendCapError extends Error {
  constructor(totalUsd: number, capUsd: number) {
    super(
      `Spend cap reached: $${totalUsd.toFixed(2)} of $${capUsd} — paid calls refused (MAX_SPEND_USD)`,
    );
    this.name = "SpendCapError";
  }
}

export async function totalSpendUsd(): Promise<number> {
  const rows = await db
    .select({ total: sum(schema.costs.costUsd) })
    .from(schema.costs);
  return Number(rows[0]?.total ?? 0);
}

/** Throws before any paid call once the hard stop is hit. */
export async function assertUnderSpendCap(): Promise<void> {
  const cap = Number(process.env.MAX_SPEND_USD ?? DEFAULT_MAX_SPEND_USD);
  const total = await totalSpendUsd();
  if (total >= cap) throw new SpendCapError(total, cap);
}

export async function recordCost(entry: {
  workspaceId?: string | null;
  job: JobKind;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  costUsd: number;
}): Promise<void> {
  await db.insert(schema.costs).values({
    workspaceId: entry.workspaceId ?? null,
    job: entry.job,
    provider: entry.provider,
    model: entry.model,
    inputTokens: entry.inputTokens,
    outputTokens: entry.outputTokens,
    cacheReadTokens: entry.cacheReadTokens ?? 0,
    costUsd: entry.costUsd,
  });
}
