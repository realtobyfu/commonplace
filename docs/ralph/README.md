# The process appendix

This project was built by a coding agent working phase-by-phase against
[the engineering spec](../../commonplace-spec.md), with every judgment call
the spec marks `HUMAN GATE` decided by a human and recorded in
[docs/decisions.md](../decisions.md). This directory is the working residue
of that process, kept deliberately — it shows *how* the thing was built, not
just what got built.

## What's here

- **[progress.md](progress.md)** — one paragraph per completed build phase,
  appended chronologically. The honest version: it records the bugs found by
  running the real system (a reasoning model silently eating its own token
  budget; a "resumed" note that fired on every retry), the design pass that
  had over-applied "quiet" into bland, and the phases that were re-scoped
  mid-build (the §16 blind eval waived by cost fiat when Groq pricing made
  the question moot).
- **[groq-research.md](groq-research.md)** — a background research agent's
  live-verified survey of Groq's model catalog, pricing, caching, and
  deprecations, produced before the provider pivot. This document is why the
  build cost $0.26 instead of the budgeted $100.
- **[background-prompts.md](background-prompts.md)** — self-contained
  research prompts that were handed to parallel agent sessions for work that
  didn't depend on open human gates (corpus verification, the Swift
  Evolution pack sources). Each wrote its results into the repo as JSON
  (`corpus-research*.json`, consumed by `scripts/fetch-corpus.ts`).
- **[chunk-previews/](chunk-previews/)** — the actual artifacts reviewed at
  the H1 chunking gate: sample passages from four works across three genres
  (dialogue, aphorism, treatise), which is what the per-author-strategies
  verdict was decided on.

## The shape of the process

Each build phase ended with tests green, lint and typecheck clean, a
progress paragraph, and a commit. Phases never started while a prior phase's
human gate was open. Background agents handled research that could run in
parallel; the main build stayed serial and gated. When live testing
contradicted the code's apparent correctness, the live result won — three
production bugs in the conversation loop were found only by running it.
