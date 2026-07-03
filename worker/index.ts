try {
  process.loadEnvFile(".env");
} catch {
  // no .env yet — defaults and shell env apply
}

import { NativeConnection, Worker } from "@temporalio/worker";
import { OpenTelemetryActivityInboundInterceptor } from "@temporalio/interceptors-opentelemetry/lib/worker";
import { startOtel } from "../lib/otel";
import * as activities from "./activities";

export const TASK_QUEUE = "commonplace";

async function run() {
  const otel = startOtel("commonplace-worker");

  const connection = await NativeConnection.connect({
    address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
  });

  const worker = await Worker.create({
    connection,
    workflowsPath: require.resolve("./workflows"),
    activities,
    taskQueue: TASK_QUEUE,
    interceptors: {
      activity: [
        (ctx) => ({
          inbound: new OpenTelemetryActivityInboundInterceptor(ctx),
        }),
      ],
    },
  });

  console.log(`Worker listening on task queue "${TASK_QUEUE}"`);
  try {
    await worker.run();
  } finally {
    await otel.shutdown();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
