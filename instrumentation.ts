export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startOtel } = await import("./lib/otel");
    startOtel("commonplace-web");
  }
}
