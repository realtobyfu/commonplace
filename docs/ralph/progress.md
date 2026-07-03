# Build progress

One paragraph per completed phase, appended chronologically.

## P0 — Skeleton (2026-07-02)

Next.js 16 (App Router, TS strict, Tailwind v4 with the §13.5 reading-room
tokens), docker-compose (pgvector postgres on host port 5433 — 5432 was taken
by a host postgres — plus Jaeger), full §10.1 Drizzle schema migrated, Temporal
dev server + worker with a hello-world workflow, and OTel wired through the
Temporal activity interceptor. DONE check passed: `pnpm tsx
scripts/run-hello.ts` runs the workflow and its `RunActivity:greet` span is
visible in Jaeger. Notes: eslint pinned to v9 (eslint-config-next's react
plugin breaks on v10); `drizzle-kit migrate` swallows errors, so `pnpm
db:migrate` uses a programmatic migrator script instead.
