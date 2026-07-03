# Commonplace

*A long-context memory workspace, named for the commonplace book — the
centuries-old practice of copying passages from many works into one personal
notebook, organized by idea rather than by source.*

A web workspace where an LLM's **working memory is a first-class, visible,
manipulable product surface**. Load a corpus larger than any context window,
watch what the model currently "holds," pin and evict it, and see memory
changes narrated as they happen.

**What's simulated vs. real:** there is no real 100M-token context. Working
memory here is the assembled prompt context on today's models — this is a
design prototype for the long-context world, built honestly on the current
one.

## Quickstart

Four processes, one terminal each:

```sh
# 0. one-time setup
cp .env.example .env          # add your ANTHROPIC_API_KEY
pnpm install
docker compose up -d          # postgres (pgvector) + jaeger
pnpm db:migrate

# 1. Temporal dev server
temporal server start-dev

# 2. Temporal worker
pnpm worker

# 3. Next.js app
pnpm dev
```

Verify the plumbing: `pnpm tsx scripts/run-hello.ts` runs a trivial workflow;
its trace appears in Jaeger at <http://localhost:16686>.

## Corpus

Public-domain English translations from Project Gutenberg only. The license
table (translator + license basis per work) lives here once `pnpm
fetch-corpus` has run — see `corpus/manifest.json`.

## Development

- `pnpm typecheck && pnpm lint && pnpm test` — the phase-exit bar.
- `docs/decisions.md` — dated HUMAN GATE verdicts (H1–H7).
- `docs/ralph/progress.md` — one paragraph per completed build phase.
