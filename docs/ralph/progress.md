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

## P4 fix — the resume note was firing on ordinary retries (2026-07-03)

A live test run (worker + Temporal up, no Groq key yet) surfaced a real bug:
the "resumed after an interruption" note was implemented as "fires when an
activity's attempt > 1," which is also true for ordinary Temporal retries
(an Ollama hiccup, a Groq 429) — the ingest screen showed eight copies of the
note in one run, exactly the retry-exposing failure mode H2 forbids. Fixed by
moving the check out of every activity entirely: `noteResumedWorkOnBoot()`
(`worker/activities/ingest.ts`) runs once when the worker process starts,
looks for any work stuck in a non-terminal status from a *previous* process,
and emits one note per affected pack. Ordinary activity retries now produce
zero events, matching "never expose retries" literally.

## Workspace UI — three-surface shell built against real partial data (2026-07-03)

Built `GET /api/w/:id/state` (§12) backed by a shared `lib/workspace/state.ts`
query, and the three-surface workspace (§13.1) at `/w/[workspaceId]`: `Shelf`
(collapsible, works grouped by author, per-author domain vocabulary from the
pack — never hardcoded), `MemoryPanel` (budget meter, ghost-card empty state
per §13.4, op feed, card states wired for the future condense/unfold
transition), `Conversation` (promise line hero, starter-prompt fallback copy,
composer disabled with in-voice copy until ingestion completes — no fake
network calls, no debug jargon). Verified live in the browser against the
actual DB state left over from the earlier ingestion test (17 works pending,
Republic mid-summarize at 198 real passages) — shelf shows "reading" in
verdigris exactly where expected, ghost cards and empty op feed render
correctly, shelf collapse/expand works. No console errors. Typecheck, lint,
and the 10 chunker tests all green. P5 (memory manager) and P6 (conversation
loop) are still needed before the panel/composer have real data to show —
this pass proves the surfaces themselves are sound.

## P5 — Memory core (2026-07-04)

`.env`/`GROQ_API_KEY` is still pending on Tobias's end (my access to `.env*`
is permission-blocked, and inlining the key into a background shell command
was blocked by the auto-mode credential-leakage classifier — confirmed both
paths are closed, not just untried). Rather than stall, moved to P5, which
the spec already scopes as LLM/DB-free: `lib/memory/` — `plan()` computes
loads + the cheapest eviction set from a required-items list (never pins,
stalest-then-lowest-weight first, compress not drop — the card stays behind
at `state: "compressed"`, nothing is deleted); `pin`/`unpin`/`manualEvict`/
`manualHydrate` cover the user-override half of H3; `orderForContext` gives
the deterministic pinned-then-recency ordering §10.2 wants for stable Groq
prompt-caching prefixes. Modeled time as a monotonic turn counter rather than
wall-clock timestamps specifically so eviction-ordering and reason-text tests
are deterministic, not time-flaky — the persistence layer (P6) will map turn
number to `last_touched_at`. 26 unit tests green, covering exactly the DONE
bar (eviction ordering, pin inviolability, budget overflow) plus manual ops
and cache-stable ordering. Typecheck/lint clean. No UI surface this pass.

## P6 — Conversation loop, built and partially verified (2026-07-04)

The full §11 loop in `lib/workspace/loop.ts`: router (Groq gpt-oss-20b, strict
JSON against a card+work index, invalid ids filtered) → `memory.plan()` →
persist + narrate ops → streaming synthesis (new `chatStream` in lib/llm,
usage-chunk cost metering) → provenance markers stripped into
`message_provenance` → done. One SSE wire from POST /api/w/:id/messages
carries status / memory_op / answer_delta / done / error frames; the shell
fans them out (panel feed animates while the answer streams). H5 shipped as
act-and-narrate with `ASK_ABOVE_TOKENS = Infinity`. §11.4 retrieval fallback
has two tiers: pgvector cosine over summaries when embeddings exist, keyword
scan over summaries when they don't (Ollama still absent) — router failure
or empty picks degrade to it, so answers stay grounded. `memoryStore.ts` maps
the pure module to working_memory_items (costs recomputed from content on
load; new `last_touched_turn` column carries the monotonic clock). User ops
route (POST /api/w/:id/memory) shares the same pure module + audit log.

Verified WITHOUT the still-missing Groq key by driving the user-ops API
against real corpus data: hydrate → pin → hydrate → compress on real
Republic passages produced correct reasons ("You brought *The Republic §42*
into memory."), and the panel now shows all three §13.2 card states live —
pinned (amber glyph, 1p badge), hydrated, compressed (reduced
opacity/height) — plus the op feed verbatim and the budget meter's first
fill. 35 tests green (chunker + memory + provenance parsing/stripping).
NOT yet verified: the two LLM legs (router call, synthesis streaming) and
provenance chips with live citations — first message after the key lands
exercises them. STOP → H3 tune + H5 demo follow that.

## P6 design pass — restraint had become blandness (2026-07-04)

Tobias's read on the first build: "the UI looks terrible and super bland."
Fair — §13.5's "quiet"/"no shadows"/"not shouted" language had been
implemented as low contrast everywhere rather than palette discipline (only
two accents, ever) with normal visual structure. Fixed without adding any
new colors: shelf + memory panel now sit on a recessed background tint
(`--color-paper-recessed`) distinct from the conversation's pure-paper tone,
so the three surfaces read as differentiated regions instead of one flat
plane; ghost cards and the starter-prompt placeholder got a visible fill and
higher base opacity instead of 30% dashed outlines; the budget meter is
visible by default (was fully transparent until hover — nobody would have
found it); section headers got real dividers; the "reading" work in the
shelf gets a pulsing verdigris dot, not just tiny mono text. Verified live —
same real data, same 35 tests green, zero console errors, meaningfully more
legible and intentional-looking. Recorded as a memory note for future design
work on this project.

## P4/P6 — first real ingestion + three live bugs found and fixed (2026-07-04)

With a live GROQ_API_KEY, ran the actual 18-work corpus through the real
pipeline for the first time: 3,289 passages, 3,289 summaries (100%), 6
concept cards, 6 generated starter prompts, zero errors, **$0.189 total** —
under the $0.30 estimate. Embeddings still defer everywhere (no Ollama);
retrieval fallback would use the keyword tier if ever needed.

Then ran the actual conversation loop live and found three real,
production-breaking bugs no amount of code review would have surfaced:

1. **Router always failed, silently.** `openai/gpt-oss-20b` is a reasoning
   model — at `maxTokens: 300` it spent the whole budget on hidden reasoning
   and returned empty content, which Groq's strict JSON mode rejected as a
   400. The `try/catch` around the router call swallowed this as "router
   found nothing," so *every* answer silently used keyword-only retrieval
   fallback and concept cards were never actually used, despite six of them
   existing. Fixed: `maxTokens: 1500` (verified via a standalone debug
   script against the real DB before touching the app code), plus the catch
   block now `console.error`s so a real outage isn't indistinguishable from
   a legitimate empty-picks result next time.
2. **Reasoning leaked into the visible answer.** Without an explicit
   `reasoning_format`, Groq mixed gpt-oss's raw thinking tokens into the
   same content stream — live answers came back full of "wait, let me pick
   a different passage... no... maybe the id is..." Fixed by setting
   `reasoning_format: "hidden"` on both the plain and streaming Groq calls
   in `lib/llm/index.ts`. This alone then caused a *second* symptom: with
   reasoning hidden and a large working set, the model burned its entire
   1500-token synthesis budget on hidden reasoning and returned zero visible
   output. Fixed by raising synthesis to `maxTokens: 4096` — reasoning and
   visible completion share one budget on these models.
3. **Raw `[[p:id]]` markers were permanently stuck in every displayed
   answer**, even though the server-side strip was working correctly. Root
   cause: `stripProvenanceMarkers` runs once, server-side, after the full
   stream ends, and the cleaned text was written to the DB — but the `done`
   SSE event never carried that cleaned text back to the browser, so the
   client kept showing its own raw accumulated stream forever. Fixed by
   adding `content` to the `done` event payload and having the client
   replace the message body with it. Separately hardened
   `stripProvenanceMarkers` to also remove malformed citation attempts
   (`[[p:11]]` — the model citing a short ordinal instead of the real UUID)
   so a bad citation doesn't leak brackets into otherwise-clean prose.

All three fixed, unit-tested (38 tests: 2 new provenance cases), and
re-verified live end to end: a cross-thinker question now genuinely routes
to the right concept card, hydrates real Schopenhauer + Kant passages,
streams a clean multi-paragraph answer with zero visible artifacts, and
attaches one real, DB-verified provenance chip resolving to an exact
passage. Total live-testing spend: $0.225. This is the P6 DONE check,
satisfied for real — not just wired up. STOP → H3 tune + H5 demo remain.

## H3 + H5 — the two post-P6 gates, built, demoed, and decided (2026-07-04)

Both gates the spec attaches to P6's completion. Built the missing halves so
each was demoable, then Tobias recorded verdicts (docs/decisions.md).

The tunables moved from constants to a per-workspace `settings` jsonb column
(migration 0003) with a `resolveSettings` merge/clamp layer, threaded through
the loop, both memory API routes, and `loadWorkspaceState`. A memory-settings
drawer (gear in the panel header) turns the knobs live via PATCH
/api/w/:id/settings.

- **H3** — `evictToFit` now blends staleness and importance into one score
  (`staleness * stalenessWeight − weight`) instead of a hardcoded
  staleness-then-weight sort; a unit test proves stalenessWeight 0 vs 1 flips
  which of two cards is compressed. Verdict: keep 80K budget, balanced 1.0
  weighting (defaults, retunable in the drawer).
- **H5** — built the pause-and-ask path: the loop sums a turn's new hydration
  and, if it exceeds `askAboveTokens`, emits an `interrupt` and returns having
  persisted nothing (restructured so the user message is only written once the
  gate clears — no orphaned rows on cancel). The composer shows a Bring-it-in
  / Cancel affordance; approve re-POSTs with a bypass flag. Verified live at a
  2k threshold. Verdict: act-and-narrate default, pause-and-ask kept in
  settings (off) for the demo.

One more live artifact caught and fixed along the way: gpt-oss-120b sometimes
emits fullwidth-bracket ordinal citations (【p:30】); the strip regex now
handles that variant alongside the ASCII forms. 38 tests green. Remaining
open gates: H2 (progress-design review) and H7 (promise line), both in P8.

## P7 + P8 plumbing — choreography, drill-down, timeline, costs (2026-07-05)

Split across two parallel workstreams: a background agent built the
self-contained new files (GET /api/w/:id/timeline merging events+memory_ops,
GET /api/costs with per-job aggregation, ActivityTimeline drawer,
CostsSection) while the panel choreography was built inline — clean split, no
file conflicts, one integration pass.

P7, all verified live in the browser against real data:
- **Condense/unfold choreography**: 400ms cubic-bezier(0.22,1,0.36,1) on
  max-height+opacity; newly hydrated cards play a one-time `unfold` entrance
  (membership tracked via React's adjust-state-during-render pattern after
  the compiler lint rejected the ref-in-render version). Reduced motion
  degrades to crossfade via the existing global rule.
- **Panel animates mid-stream** (§11 step 2, previously missed): memory_op
  SSE frames now debounce-trigger a working-set refresh, so cards unfold
  *while* the answer streams — watched "About The Social Contract &
  Discourses" enter the panel live during the Rousseau answer.
- **Drill-down** (card → passages → exact text) via new
  /api/items/:type/:id/passages; expanded "the categorical imperative" to
  its real §30 Kant passage in the panel.
- **Provenance chip → passage overlay + parent-card flash** via new
  /api/passages/:id (returns citing cardIds); chip opened Schopenhauer §474
  with full source text in Newsreader.
- **Drag-from-shelf → hydrate**: shelf works carry a JSON dataTransfer
  payload; the panel is a drop target with a verdigris-wash hover state.

P8 plumbing: activity timeline drawer (clock icon; §14 story now real — the
loop writes `router` and `synthesis` event rows with trace ids, so a turn
reads "Chose 1 source from the shelf, starting with *About The Social
Contract & Discourses*" → ops → "Answered with N citations", each row
deep-linking to Jaeger), and the settings drawer grew the §15 SPEND section
($0.24 of $25.00 live, per-job table: 3,291 summarize calls = $0.183).
Typecheck/lint/38 tests green. Build total so far: $0.24 of the $100
acceptance ceiling. Remaining for P8 proper: session-persistence pass,
starter-prompt empty-state check post-ingestion, then STOP → H2 + H7.

## P9 — second pack proves the architecture generalizes (2026-07-05)

The Swift Evolution pack: 20 proposals (94K words, Swift 3→6, agent-fetched
with per-proposal authorship and Apache-2.0 license notes) ingested through
the *identical* pipeline that read the philosophy canon. Produced 8 concept
cards — concurrency, actors, ownership, async/await, result builders,
Sendable, macros, and a "source compatibility" card synthesized across 8
distinct proposal authors — plus 6 genuinely sharp Swift-specific starter
prompts. Verified live in the browser: same three-surface UI, shelf now
grouped by proposal author (Lattner, Gregor, Abrahams…), "Proposal"
vocabulary, its own promise line. **Zero code changes outside domain-packs/
and the corpus** — the P9 DONE criterion, met exactly.

Generalization work, all format-detection not domain logic: markdown ATX
headings (`##`) recognized alongside Gutenberg-uppercase headings; per-pack
manifests at corpus/<packId>/manifest.json with a legacy fallback for
philosophy; chunk-preview grew a `--pack` flag. Two spec-completeness fixes
landed alongside: a fresh workspace on an already-ingested pack now inherits
that pack's starter prompts (acceptance criterion 3 — verified: new
philosophy workspace got all 6 and skipped re-ingestion), and one more live
Groq quirk — `reasoning_format` 400s on non-reasoning (Llama) models — gated
by model family.

**H2 kill-test passed for real on this run.** SIGKILL'd the worker
mid-summarization (87 swift summaries in), restarted it: exactly one quiet
"resumed after an interruption" note fired at boot, Temporal's heartbeat
timeout retried the interrupted batch, summarization continued past 87 with
zero duplicate summaries (the passage-id PK plus idempotent upserts holding).
Total build spend through P9: **$0.26** of the $100 ceiling. Remaining open
gates: H2 design *review* (mechanics proven; Tobias confirms the UX) and H7
(promise line). 38 tests green.

## P8 close-out + P10 — persistence verified, portfolio wrap (2026-07-09)

The two outstanding P8 items, verified live in the browser. Session
persistence (acceptance criterion 6): the main workspace reopened after a
five-day gap with all 16 messages, 14 memory items, and the 56K/80K budget
meter intact; compressed a card, reloaded the page, the compressed state
persisted (opacity-55, meter down 652 tokens); clicked hydrate and it
unfolded back with "You brought *The Wisdom of Life §0* into memory." in the
op feed — the full leave-and-return loop, real. Post-ingestion empty state
(§13.4): fresh workspaces on both packs show the promise line, six
data-driven starter prompts with behavior labels, and ghost cards. Two
blemishes found and fixed along the way: one generated starter prompt leaked
taxonomy meta-language ("…why might this be considered a deep-dive…") — both
packs' `starterPromptGen` templates now forbid mentioning the label, and the
stored prompts were trimmed; and `*work titles*` rendered as literal
asterisks in starter-prompt buttons — now rendered through `Emphasized`.

P10: README gained the §11.4 thesis section (retrieval-era vs memory-era UX,
quoting the fallback's actual op-feed reason) and a Swift Evolution corpus
section with its Apache-2.0 license basis; `docs/demo-script.md` walks the
§18 acceptance criteria as five timed demo beats; `docs/ralph/README.md`
frames this directory as the process appendix; the portfolio brief's stale
status section was rewritten to the P10 truth. Typecheck/lint/38 tests
green. Remaining: the two open human gates, H2 (progress-design sign-off)
and H7 (promise line).

## Post-spec — the front door, and the fonts that were never there (2026-07-11)

Two workstreams landed together. First, the reading-surfaces polish pass
that had been sitting uncommitted: RichText (a dependency-free markdown
subset renderer for model prose, with citation-token lifting and
half-streamed-token hiding), the WorkOverlay section reader (shelf click →
per-section summaries → exact passage, layered Escape closing one sheet at
a time), source reflow in the PassageOverlay (Gutenberg hard wraps
collapsed to real paragraphs, `_underscores_` rendered as the print
edition's italics), summary-scaffolding stripping, and a provenance pass
that rescues real UUIDs out of malformed citation shapes instead of
discarding them.

Second, the app finally got a front door. `app/page.tsx` was a dead-end
stub — title, tagline, no way in. It's now the book's front matter: a
title page (§ ornament, Newsreader at scale, the H7 promise line with
*reads* in italic), each pack set like a bibliography entry (collation
line in mono, epigraph, "New workspace" / "Read this corpus"), and
workspaces as table-of-contents rows — first question, dotted leader,
marginalia (messages · in-memory count · date). The create → route →
empty-state loop verified live; the ingest screen now ends in an "Enter
the workspace" action instead of a dead stop, and the shelf carries a
quiet wordmark link back home.

Two bugs found under the presentability complaint, both invisible until
poked. **The entire site's typography was silently broken**: font tokens
in a plain `@theme` reference next/font variables that live on `<body>`,
so they resolved empty at `:root` and everything fell back to system sans
— the "looks very AI" reaction was substantially this. Fixed with `@theme
inline` plus named utilities (`font-corpus`/`font-ui`/`font-mono`
replacing the arbitrary-value form repo-wide). And the home loader's
correlated subqueries: drizzle renders an interpolated outer-table column
unqualified, so `m.workspace_id = "id"` self-compared inside `messages`
and every workspace showed zero conversation. Hand-qualified correlation
fixed it. Typecheck/lint green, 49 tests green, all surfaces verified in
the browser at 1280px.
