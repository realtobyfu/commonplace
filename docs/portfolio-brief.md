# Commonplace — portfolio briefing

Raw material for writing portfolio-site copy about this project. Facts only,
verified against the repo as of 2026-07-04 (12 commits) — not marketing prose.

## One-liner

A commonplace book that reads for you — six thinkers, one working memory,
watch it think.

## What it is

A web workspace where an LLM's **working memory is a first-class, visible,
manipulable product surface** — not hidden context plumbing. You load a
corpus larger than any context window, and the app shows what the model
currently "holds," lets you pin/evict/steer it, and narrates memory changes
as they happen. The showpiece interaction: ask a question that spans two
philosophers and *watch* both thinkers hydrate into working memory side by
side, with the answer streaming out with inline citations back to exact
source passages.

**Why this project:** built as a portfolio piece targeting a
product-engineering role at a long-context AI lab. The core bet is that
"working memory as a product surface" is itself the interesting design
problem — most chat UIs hide context management entirely; this one makes it
the whole point.

**What's honestly simulated:** there's no real 100M-token model context yet.
"Working memory" here is the assembled prompt context on today's models —
the project is explicit (in its own README) that it's a design prototype for
a near-future long-context world, not a claim that the underlying model has
some novel memory capability.

## The corpus

18 public-domain philosophy texts — Plato, Nietzsche, Kant, Schopenhauer,
Hegel, Rousseau — 1,750,806 words, all sourced from Project Gutenberg with
per-work translator and license verification (a background research agent
cross-checked every Gutenberg ebook ID against its actual bibrec page before
anything was downloaded). Corpus composition was actively curated, not just
accepted as-fetched: an early draft over-indexed on one author (34% of the
corpus was Schopenhauer, an artifact of how Gutenberg split one translator's
essays into seven separate volumes) and was rebalanced; Hegel was added back
in via a different, clearly-public-domain translation after the originally
spec'd translation turned out not to exist on Gutenberg at all; a
Kaufmann-translation request was declined because it's still under
copyright — the project holds a hard line of "unclear license → exclude."

## Stack

Next.js 15+ (App Router, TypeScript strict), Tailwind CSS v4 with a custom
"reading room" design system (no component library — about a dozen
hand-built primitives), Temporal for durable/resumable workflow orchestration,
Postgres 16 + pgvector via Drizzle ORM, OpenTelemetry tracing exported to
Jaeger, and a swappable LLM provider layer currently routed to Groq
(OpenAI-compatible, GPT-OSS models) for paid calls and Ollama for local/free
work — model routing lives in one config object, not scattered through code.

## Architecture highlights

- **Domain-pack system**: every chunking rule, prompt template, UI label, and
  starter prompt lives in a typed config object, not in application code. The
  philosophy pack is the reference implementation; a second pack (Swift
  Evolution proposals) exists as a schema-validating stub to prove the
  architecture generalizes to a completely different domain without touching
  `lib/` or `components/`.
- **Structure-aware corpus chunking**: three distinct chunking strategies —
  dialogue (breaks at speaker turns), aphorism (one passage per numbered
  section, tiny ones merged), treatise (section-heading-based with
  soft-cap + overlap) — selected per author, because a naive fixed-size
  splitter would butcher a Platonic dialogue and a Nietzsche aphorism
  identically. Front matter (contents pages, translator introductions) is
  detected and excluded so a translator's Victorian commentary can never get
  mis-attributed as the philosopher's own words in a citation.
- **Durable ingestion pipeline**: a Temporal workflow chunks, summarizes,
  embeds, and synthesizes concept cards across the whole corpus. Every
  activity is idempotent (upserts, not inserts) and the batch-summarize step
  re-queries what's left rather than tracking an offset, so killing the
  worker process mid-run loses zero progress — verified with a real
  worker-restart test, not just claimed.
- **Cost-conscious engineering, mid-flight**: the original plan routed
  synthesis through the Anthropic API. When cost became the priority, the
  project pivoted to Groq mid-build — a background research agent verified
  Groq's live model catalog and pricing before the switch, and a real
  correctness bug this surfaced (see below) got caught and fixed via live
  testing rather than left in place. Projected full-corpus ingestion cost:
  well under $1.
- **A real bug, found and fixed by actually running the system**: the
  ingestion screen's "resumed after an interruption" note (the one and only
  failure surface the UI is allowed to show a user, by design) was
  originally implemented as "fires whenever a Temporal activity retries" —
  which meant it fired on *every* transient network hiccup, not just a true
  process crash-and-restart. A live test run surfaced this immediately (8
  duplicate notes in one run); the fix moved the check to a one-time
  boot-time scan instead of a per-activity hook. This is the kind of bug that
  only surfaces by running the real system, not by reading the code — worth
  noting because it happened.
- **Pure, unit-tested working-memory manager**: the hydrate/evict/pin/budget
  logic has zero LLM calls in it and is fully deterministic — given a working
  set and a token budget, it computes the cheapest eviction plan (pinned
  items are inviolable, staleness-weighted otherwise) and writes a
  human-readable reason for every move ("Compressed *Hegel: the dialectic* —
  untouched for 12 turns"). Context assembly uses stable ordering
  specifically to get long, cacheable prompt prefixes.
- **The conversation loop**: one HTTP stream carries three interleaved event
  types — status updates in domain language ("Bringing *Genealogy of
  Morals* into memory…", never "thinking…"), memory-panel operations, and
  streaming answer text — so the panel visibly animates *while* the answer
  is still being written, not after. Citations are parsed out of inline
  `[[p:passage_id]]` markers the model is instructed to emit and rendered as
  clickable provenance chips.
- **A formal human-in-the-loop decision protocol**: the build follows a
  written spec with seven explicit "HUMAN GATE" checkpoints — chunking
  strategy, eviction policy, ingestion model choice, progress-UI design,
  interrupt policy, and the product's own tagline — each with a dated,
  reasoned verdict recorded in a decisions log rather than resolved
  silently by whichever agent happened to be building that day.

## Design

A custom visual language deliberately built to avoid both the generic
"AI chat" look and the generic SaaS-dashboard look: warm paper background,
graphite ink text, a strict two-color accent discipline (one color means
"this is currently in the model's memory," a second, different color means
"the user pinned this" — and neither appears anywhere else in the UI).
Newsreader serif for corpus text, Inter for interface chrome, JetBrains Mono
for passage ordinals and token counts. The signature interaction is the
memory panel's condense/unfold motion when items move in and out of context.
An early build pass over-applied the spec's "quiet, no shadows" language into
genuinely low contrast (an invisible-until-hover budget meter, 30%-opacity
ghost cards); caught via direct user feedback and corrected without adding
any new colors — the fix was giving the three panels visually distinct
background regions and making waiting/empty states legible by default.

## Current build status

12 commits in. Complete: repo skeleton with full observability wiring,
corpus acquisition and licensing, structure-aware chunking (human-reviewed
and approved), the full durable ingestion pipeline (built and unit-verified;
awaiting an API credential to run the live end-to-end pass), the pure memory
manager, and the full conversation loop (router → memory-plan → streaming
synthesis → citation extraction) wired to a three-surface workspace UI
(corpus shelf, conversation, memory panel) — verified live in-browser against
real ingested data, not mocks. ~4,200 lines of application code, 35 passing
unit tests. Remaining: a live end-to-end conversation demo (blocked only on
an API key), the panel's signature condense/unfold animation polish, a
settings drawer for cost/routing visibility, the second domain-pack proof,
and final portfolio packaging (README, demo script, license table).
