import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@opentelemetry/sdk-node",
    "@temporalio/client",
    "postgres",
  ],
};

export default nextConfig;
