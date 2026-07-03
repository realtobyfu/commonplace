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

## P1 — Corpus (2026-07-02)

A background research agent verified every Gutenberg ID against bibrec pages
(results in `corpus-research.json`); `scripts/fetch-corpus.ts` is data-driven
off that file. Fetched, cleaned, and checked in 19 works / 1,282,457 words:
Plato ×5 (Jowett), Nietzsche ×4, Kant ×2, Schopenhauer ×8 (the Saunders
"Essays" turned out to be seven separate Gutenberg volumes). Both Gutenberg
footer formats handled (`*** END ***` and `End of Project Gutenberg's …`);
boilerplate verified fully stripped. Exclusions recorded in the manifest and
README: Hegel (Sibree's Philosophy of History absent from PG; no PD English
Science of Logic) and Kierkegaard (no complete PD translation). This leaves
4 thinkers, not 6 — flagged to Tobias since the draft promise line says "six
thinkers" (H7) and Wallace's PD Hegel translations exist as possible
substitutes.

## P2 — Chunking (2026-07-02)

Structure-aware chunker in `lib/chunking/` with the three §9.2 strategies
(dialogue / aphorism / treatise) selected per author from the pack config;
passages carry ordinal, char offsets, heading breadcrumb, and estimated token
count (chars/4). Seven unit tests cover heading breaks, soft-cap overlap,
aphorism merging, and speaker-turn breaking. Preview CLI (`pnpm chunks --work
republic --sample 10`) generated review artifacts for three genres in
`docs/ralph/chunk-previews/`: Republic (dialogue) 392 passages p50 818, Beyond
Good and Evil (aphorism) 167 passages p50 491, Critique of Pure Reason
(treatise) 441 passages p50 1033. Known review items for H1: front matter
(contents pages, translator prefaces, Jowett's long introductions) currently
chunks like body text; a handful of single-paragraph passages exceed the soft
cap. STOPPED at H1.

## P1 amendment — corpus rebalance (2026-07-02)

Tobias reshaped the corpus at the phase boundary: Schopenhauer trimmed from 8
works to 3 (was 34% of the corpus), Hegel added via Wallace's clearly-PD
Encyclopaedia translations (flagged as substitutions), Rousseau added (Cole's
Social Contract & Discourses, Foxley's Emile). A second background agent
verified all five candidate IDs against bibrec pages and title pages
(`corpus-research-additions.json`); Rousseau's Confessions failed the
provenance check and is excluded. Kaufmann's Nietzsche was requested and
rejected (copyright). Result: 18 works, six thinkers, 1,750,806 words —
the "six thinkers" promise line holds again. Full reasoning in
docs/decisions.md "Corpus scope amendments".

## P2 close-out — H1 recorded, chunker amendments (2026-07-02)

H1 verdict: per-author strategies stay. Two amendments implemented: (1) front
matter never becomes passages — title-page lines and list-shaped contents
blocks are dropped until real prose appears, and sections whose headings match
per-author `skipHeadings` patterns (Jowett's "Introduction and Analysis",
editor introductions) are skipped entirely; (2) passages still over the soft
cap are sentence-split with exact offsets preserved. Effect on previews:
Republic 392 → 198 passages (half the file was Jowett commentary), all works'
max token counts now within cap × 1.25. 10 unit tests green. Also recorded:
provider amendment replacing the Anthropic API with Groq (cost) — background
agent's live-verified catalog/pricing in docs/ralph/groq-research.md says
full-corpus ingestion lands under $1 and a conversation turn ~1¢; Groq has no
embeddings endpoint, so Ollama keeps embeddings. Kimi K2 is deprecated on
Groq; GPT-OSS models are the current caching-capable tier. NOTE: .env.example
still says ANTHROPIC_API_KEY — swap to GROQ_API_KEY manually (agent's .env*
access is restricted).

## P4 — Ingestion pipeline, code complete (2026-07-03)

H4 decided by cost fiat (Groq cheap models; §16 eval waived — see
decisions.md), so P3 folded into P4. Built: `lib/llm/` provider abstraction
(Groq OpenAI-compatible + Ollama, per-call OTel spans, cost rows,
MAX_SPEND_USD hard stop), durable `ingestPack` → `ingestWork` workflows with
idempotent activities (passages upsert on (work_id, ordinal), summaries on
passage_id, batched summarize loop that re-queries remaining so crashes
resume mid-work), the quiet "resumed" note on activity retry (attempt > 1),
graceful embedding deferral when Ollama is absent, concept-card synthesis
from pack conceptSeeds, starter-prompt generation, SSE event stream, and the
ingest screen (works checklist by author, milestone ticker, elapsed, running
cost, no percentage bar). Typecheck/lint/tests green. NOT yet run end to end:
no .env exists, so no GROQ_API_KEY — full-corpus ingestion and the
kill-the-worker resumability test await credentials.
