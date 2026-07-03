import { executeChild, proxyActivities } from "@temporalio/workflow";
import type * as activities from "../activities";

/**
 * Ingestion workflows (§9.1): ingestPack → child ingestWork per work →
 * batched activities. Durable and resumable — every activity is idempotent
 * and the summarize loop re-queries remaining passages, so killing the
 * worker resumes from the last completed batch.
 */

const acts = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
  heartbeatTimeout: "2 minutes",
  retry: {
    initialInterval: "2s",
    backoffCoefficient: 2,
    maximumAttempts: 5,
  },
});

export interface IngestWorkInput {
  workId: string;
  workspaceId: string;
  packId: string;
  workIndex: number;
  workTotal: number;
}

export async function ingestWork(input: IngestWorkInput): Promise<void> {
  await acts.chunkWorkActivity(input);

  for (;;) {
    const { remaining } = await acts.summarizeBatch({
      ...input,
      batchSize: 16,
    });
    if (remaining === 0) break;
  }

  const { deferred } = await acts.embedWork(input);
  await acts.finishWork({ ...input, embeddingsDeferred: deferred });
}

export interface IngestPackInput {
  packId: string;
  workspaceId: string;
}

export async function ingestPack(input: IngestPackInput): Promise<void> {
  const works = await acts.preparePack(input);

  for (let i = 0; i < works.length; i++) {
    const work = works[i];
    if (!work) continue;
    await executeChild(ingestWork, {
      workflowId: `ingest-work-${work.workId}`,
      args: [
        {
          workId: work.workId,
          workspaceId: input.workspaceId,
          packId: input.packId,
          workIndex: i + 1,
          workTotal: works.length,
        },
      ],
    });
  }

  await acts.synthesizeConceptCards(input);
  await acts.generateStarterPrompts(input);
}
