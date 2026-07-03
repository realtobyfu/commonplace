import { proxyActivities } from "@temporalio/workflow";
import type * as activities from "../activities";

const { greet } = proxyActivities<typeof activities>({
  startToCloseTimeout: "1 minute",
  retry: { maximumAttempts: 5 },
});

/** P0 hello-world workflow — proves the Temporal + OTel plumbing end to end. */
export async function helloWorld(name: string): Promise<string> {
  return await greet(name);
}

export { ingestPack, ingestWork } from "./ingest";
export type { IngestPackInput, IngestWorkInput } from "./ingest";
