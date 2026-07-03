import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

let sdk: NodeSDK | undefined;

/**
 * Start the OpenTelemetry node SDK for this process. Idempotent — the web
 * server and the Temporal worker each call it once at boot.
 */
export function startOtel(serviceName: string): NodeSDK {
  if (sdk) return sdk;

  const endpoint =
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318";

  sdk = new NodeSDK({
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: serviceName }),
    traceExporter: new OTLPTraceExporter({
      url: `${endpoint}/v1/traces`,
    }),
  });
  sdk.start();
  return sdk;
}
