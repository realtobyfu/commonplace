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
