/**
 * Set on the hosted demo deployment, which has no ingestion worker behind it
 * (Temporal + Ollama aren't run there — see docs/hosting). Creating a
 * workspace on an unread pack, or re-ingesting, would just hang or 500.
 * Gates both the UI affordance and the API route it POSTs to.
 */
export function isReadOnlyDemo(): boolean {
  return process.env.DEMO_READ_ONLY === "1";
}
