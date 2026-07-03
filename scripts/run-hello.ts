import { Client, Connection } from "@temporalio/client";
import { helloWorld } from "../worker/workflows";

async function main() {
  const connection = await Connection.connect({
    address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
  });
  const client = new Client({ connection });

  const result = await client.workflow.execute(helloWorld, {
    taskQueue: "commonplace",
    workflowId: `hello-${Date.now()}`,
    args: ["Commonplace"],
  });

  console.log(result);
  console.log("Trace should be visible in Jaeger: http://localhost:16686");
  await connection.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
