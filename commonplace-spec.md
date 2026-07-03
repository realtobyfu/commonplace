# Commonplace — Engineering Spec v1.0

*A long-context memory workspace, named for the commonplace book — the centuries-old practice of copying passages from many works into one personal notebook, organized by idea rather than by source. That's the product, built as software.*

**Audience for this document:** a coding agent (Claude Code) implementing the system phase by phase, and Tobias, who owns every decision marked `HUMAN GATE`. The agent must **stop and ask** at every HUMAN GATE rather than choosing a default.

---

## 1. What this is

A web workspace where an LLM's **working memory is a first-class, visible, manipulable product surface** — not hidden context plumbing. The user loads a large corpus (larger than any context window), and the app shows what the model currently "holds," lets the user pin/evict/steer it, and narrates memory changes as they happen.

**Demo corpus (v1):** the public-domain philosophy canon — Plato, Nietzsche, Hegel, Kant, Schopenhauer, Kierkegaard (~3–4M words). The showpiece interaction: ask a cross-thinker question and *watch* two thinkers hydrate into working memory side by side.

**Positioning sentence (draft, HUMAN GATE H7 to finalize):** "A commonplace book that reads for you — six thinkers, one working memory, watch it think."

### Why it exists (context for design decisions)
This is a portfolio project targeting a product-engineering role at a long-context AI lab. Every architectural choice below optimizes for three things, in order:
1. **Product judgment made visible** — the memory panel, empty state, and progress narration are the point.
2. **Genuine use of the target stack** — Next.js / React / Tailwind / TypeScript, Temporal, OpenTelemetry. Do not swap these for alternatives even where an alternative would be simpler.
3. **Low cost** — local models for bulk work, aggressive caching, batch where possible.

## 2. Goals

- G1. Ingest a 3–4M-word corpus into a hierarchical memory store (passages → summaries → concept cards) via a **durable, resumable Temporal workflow** that survives process restarts and narrates progress in domain terms.
- G2. A three-surface workspace UI: conversation pane, **memory panel**, corpus shelf.
- G3. Working-memory management with a visible token budget: agent-managed hydration/eviction with user override (pin, evict, drag-to-load).
- G4. Provenance: every claim in an answer links to the exact passages that were in memory when it was written.
- G5. Session persistence: leave and return; recent memory intact, older memory compressed to cards that rehydrate on demand. No "new chat" reset.
- G6. Domain packs: all chunking rules, prompts, UI vocabulary, and starter prompts live in a config, not code. Philosophy pack built deeply; architecture proven by a second pack (Swift Evolution) later.
- G7. OpenTelemetry tracing on every pipeline step and agent action, with traces surfaced in-product as an activity timeline.
- G8. Model routing config: cheap/local models for ingestion, frontier model for synthesis, with per-job cost tracking shown in a settings drawer.

## 3. Non-goals (v1)

- No auth, no multi-user, no billing. Single local user.
- No real 100M-token context. We **simulate** the memory-management UX on today's models (working memory = the assembled prompt context). This is a design prototype for that world, and the README should say so plainly.
- No mobile layout beyond "doesn't break" (min-width 1024px is fine; degrade gracefully, don't design for phones).
- No fine-tuning, no training. Inference only.
- No general file-upload corpora in v1 (domain packs only).
- Copyrighted texts are out of scope permanently for the shipped repo: **no Heidegger, Husserl, Horkheimer, or modern translations.** Public-domain translations only (see §8).

## 4. Working vocabulary

Use these words consistently in code, UI, and commits. UI copy uses the user-facing term only.

| Term | Meaning |
|---|---|
| **Corpus** | All ingested source texts for a domain pack. Lives on the shelf. |
| **Work** | One source text (e.g., *The Republic*). |
| **Passage** | The atomic chunk of a work. What retrieval and provenance point to. |
| **Summary** | A compressed rendering of one passage (1–3 sentences). |
| **Concept card** | A synthesized card spanning many passages, possibly many works ("Nietzsche on ressentiment"). The default unit shown in the memory panel. |
| **Working memory** | The set of cards/passages currently loaded into the model's context, within a visible token budget. |
| **Hydrate** | Load a card's underlying passages (or a work's cards) into working memory. |
| **Evict / Compress** | Remove raw passages from working memory, keeping the card as the compressed trace. |
| **Pin** | User marks an item un-evictable. |
| **Shelf** | The full corpus browser — everything that exists but isn't loaded. |

## 5. Stack (fixed — do not substitute)

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 15+, App Router, TypeScript strict** | Server components where sensible; client components for the workspace surfaces. |
| Styling | **Tailwind CSS v4** | Design tokens in §13. No component library; build the ~10 primitives needed by hand. |
| Workflow engine | **Temporal (TypeScript SDK)** | Local dev server via `temporal server start-dev`. All ingestion runs as workflows/activities. |
| DB | **Postgres 16 (Docker) + Drizzle ORM** | `pgvector` extension installed from day one (used in v1 only for the retrieval fallback, §11.4). |
| Observability | **OpenTelemetry JS SDK** | OTLP exporter → local Jaeger (Docker) for dev; spans also written to an `events` table so the UI can render the activity timeline without querying Jaeger. |
| LLM providers | Provider abstraction over **(a) Ollama local** (default: `llama3.1:8b` or `qwen2.5:7b`) and **(b) Anthropic API** (Haiku for cheap paid jobs, Sonnet for synthesis) | Routing is config, not code (§15). Anthropic prompt caching ON for the working-memory prefix. |
| Runtime | Node 20+, pnpm | Monorepo not needed; single app + `worker/` process for Temporal. |

**Dev environment:** one `docker-compose.yml` (postgres+pgvector, jaeger), one `pnpm dev` for Next.js, one `pnpm worker` for the Temporal worker, `temporal server start-dev` for the dev server. Document all four in the README quickstart. `.env.example` lists `ANTHROPIC_API_KEY`, `OLLAMA_BASE_URL`, `DATABASE_URL`, `OTEL_EXPORTER_OTLP_ENDPOINT`.

## 6. Repo structure

```
commonplace/
  app/                    # Next.js App Router
    (workspace)/w/[id]/   # the workspace: conversation, memory panel, shelf
    ingest/[jobId]/       # ingestion progress screen ("ingestion as theater")
    api/                  # route handlers (§12)
  components/             # UI primitives + surfaces
  domain-packs/
    philosophy/pack.ts    # THE pack config (§7)
    swift-evolution/      # stub only in v1; proves the schema generalizes
  lib/
    llm/                  # provider abstraction, routing, cost meter
    memory/               # working-memory manager (§10)
    otel.ts
    db/                   # drizzle schema + migrations
  worker/
    workflows/            # Temporal workflows (ingestion, card synthesis)
    activities/           # fetch, chunk, summarize, embed, synthesize
  scripts/
    fetch-corpus.ts       # Gutenberg download + cleanup (§8)
    eval-ingestion.ts     # model-comparison eval (§16)
  eval/                   # eval fixtures + results (checked in)
  docs/
    decisions.md          # HUMAN GATE outcomes get recorded here, dated
    ralph/                # plan files + agent session notes (part of the portfolio)
```

## 7. Domain pack system

A domain pack is a typed TS config. **Nothing domain-specific may appear outside a pack.** The philosophy pack is the reference implementation; the Swift Evolution pack ships as a schema-validating stub.

```ts
// domain-packs/types.ts
export interface DomainPack {
  id: string;                       // "philosophy"
  name: string;                     // "Philosophy Canon"
  promiseLine: string;              // the empty-state positioning sentence
  sources: SourceSpec[];            // where texts come from + license note per source
  chunking: ChunkingSpec;           // per-author overrides allowed (§9.2)
  vocabulary: {                     // UI strings: what a "work"/"author" is called here
    authorLabel: string;            // "Thinker" | "Author" | "Proposal author"
    workLabel: string;              // "Work" | "Proposal"
  };
  prompts: {
    summarizePassage: string;       // template, {{passage}} etc.
    synthesizeCard: string;
    answerSystem: string;           // the workspace conversation system prompt
    starterPromptGen: string;       // used at ingestion time to emit starter prompts (§13.4)
  };
  conceptSeeds?: string[];          // optional: concepts to bias card synthesis toward
}
```

At the end of ingestion, the pipeline generates **5–6 starter prompts per pack** (via `starterPromptGen`, biased toward concepts spanning multiple authors) and stores them on the workspace row. The empty state reads them from the DB — never hardcode starter prompts.

## 8. Corpus acquisition (`scripts/fetch-corpus.ts`)

Public-domain English translations from Project Gutenberg only. Script downloads plaintext, strips Gutenberg headers/footers, normalizes whitespace, and writes `corpus/{author}/{work}.txt` plus a `manifest.json` (title, author, translator, Gutenberg ID, license note, word count). Check the manifest into git; check the raw texts in too (they're PD — this makes the repo clone-and-run).

v1 source list (agent: verify each Gutenberg ID exists at fetch time; substitute same-translation alternates if an ID is wrong — flag substitutions in the manifest):

- **Plato** (Jowett trans.): The Republic; Symposium; Phaedo; Apology; Phaedrus
- **Nietzsche**: Thus Spake Zarathustra (Common); Beyond Good and Evil (Zimmern); The Genealogy of Morals (Samuel); The Antichrist (Mencken)
- **Hegel**: The Philosophy of History (Sibree); Science of Logic excerpts only if a PD translation is confirmed — otherwise skip Logic, do not substitute a copyrighted translation
- **Kant**: Critique of Pure Reason (Meiklejohn); Fundamental Principles of the Metaphysic of Morals (Abbott)
- **Schopenhauer**: The World as Will and Idea vol. 1 (Haldane & Kemp); Essays (Bailey Saunders selections)
- **Kierkegaard**: PD English translations are scarce — include only if a genuinely PD translation is verified; otherwise **drop Kierkegaard and note it in the README** rather than shipping a copyrighted text.

**Hard rule:** if license status is unclear, exclude. The README's corpus table lists translator + license basis for every work.

## 9. Ingestion pipeline (Temporal)

### 9.1 Workflow shape

One parent workflow per pack ingestion: `ingestPack(packId)` → child workflow per work `ingestWork(workId)` → activities: `chunkWork`, `summarizePassages` (batched, N at a time), `embedPassages`, then after all works: `synthesizeConceptCards`, `generateStarterPrompts`.

Requirements:
- **Durable + resumable**: killing the worker or laptop sleep must not lose progress; on restart, the workflow continues from the last completed activity. Use Temporal's native retry policies (exponential backoff, max 5 attempts) on LLM activities — Ollama hiccups are expected.
- **Idempotent activities**: summarizing the same passage twice must not create duplicates (upsert on passage id).
- **Heartbeats** on long activities so stuck LLM calls are detected and retried.
- **Progress events**: every meaningful step emits a domain-language event row (§9.3) — this powers the ingestion screen.
- Ingestion runs fully on the **local/free route by default** (§15); a `--model` flag on the trigger allows the paid route for the eval comparison.

### 9.2 Chunking

> **HUMAN GATE H1 — chunking scheme.** Default proposal the agent should implement behind a config switch, then STOP for Tobias to review actual output on 3 works before proceeding to summaries: structure-aware chunking with per-author overrides. Dialogues (Plato) chunk on speaker exchanges grouped to ~600–900 tokens; aphoristic works (Nietzsche) chunk per aphorism/section, merging tiny ones; treatises (Kant, Hegel, Schopenhauer) chunk on section headings with a ~1,000-token soft cap and 1-paragraph overlap. Every passage stores: work, author, ordinal, char offsets, heading breadcrumb, token count. The gate question Tobias answers: does per-author logic earn its complexity vs. one general scheme? Record the verdict in `docs/decisions.md`.

### 9.3 Ingestion as theater (progress narration)

Progress is narrated in **domain terms, milestone-grained**: "Finished *The Republic* — 312 passages, 14 concept cards forming (4 of 19 works)." Never expose retries, attempt counts, or Temporal jargon in the UI.

> **HUMAN GATE H2 — progress design.** Working position to implement, which Tobias must confirm or amend after seeing it live: reliability machinery invisible, progress narrated in domain terms; a quiet "resumed after interruption" note is the only failure surface the user ever sees. The ingest screen shows: works checklist with live counts, a slow ticker of recent milestones, elapsed time, and running cost (§15). No percentage bar (it would lie — LLM latency is unknowable).

Implementation: activities insert rows into `events` (workspace_id, kind, domain_message, otel_trace_id, created_at); the ingest screen polls or streams them. Each event carries its OTel trace id so the activity timeline (§14) can deep-link.

## 10. Memory model

### 10.1 Store (Drizzle schema sketch)

- `works` (id, pack_id, author, title, translator, license_note, word_count, status)
- `passages` (id, work_id, ordinal, text, heading, token_count, embedding vector)
- `summaries` (passage_id PK, text, model, created_at)
- `concept_cards` (id, pack_id, title, body, author_scope[], created_at) + join `card_passages` (card_id, passage_id, weight)
- `workspaces` (id, pack_id, promise_line, starter_prompts jsonb, created_at)
- `working_memory_items` (workspace_id, item_type card|passage|work_summary, item_id, state hydrated|compressed, pinned bool, loaded_at, last_touched_at, token_cost)
- `messages` (id, workspace_id, role, content, created_at) + `message_provenance` (message_id, passage_id)
- `events` (id, workspace_id, kind, domain_message, otel_trace_id, payload jsonb, created_at)
- `memory_ops` (id, workspace_id, op hydrate|evict|pin|unpin, item ref, actor agent|user, reason text, created_at) — the audit log that powers both the panel animation feed and the interview story.

### 10.2 Working-memory manager (`lib/memory/`)

Pure, unit-tested TypeScript module — **no LLM calls inside it**. Responsibilities:

- Maintain the working set within a **token budget** (default 80K; visible in the UI as a meter; configurable in the settings drawer).
- Assemble the model context deterministically from the working set: stable ordering (pinned first, then by last_touched), so Anthropic **prompt caching** gets long stable prefixes. Cards render as their body; hydrated items render underlying passage text.
- Expose `plan(requiredItems[]) → {loads[], evictions[]}`: given what the next answer needs, compute the cheapest set of evictions (never pinned items; prefer stale, unpinned, low-weight items; compress rather than drop — raw passages leave, the card stays with `state: compressed`).
- Every mutation writes a `memory_ops` row with a one-line human-readable `reason` ("Compressed *Hegel: the dialectic* — untouched for 12 turns; needed room for *The Republic* passages"). These reasons are shown verbatim in the panel feed, so write them for humans.

> **HUMAN GATE H3 — eviction policy.** Implement agent-managed-with-user-override as the default (agent plans loads/evictions each turn; user pins are inviolable; user can manually evict/hydrate anytime). STOP after the first end-to-end conversation works and let Tobias tune: budget size, staleness weighting, and whether the agent asks permission before large loads (see H5). Record in decisions.md.

## 11. Conversation & synthesis loop

Per user message:
1. **Route** (cheap model, one call): given the message + shelf index (card titles + work list), decide `requiredItems` — which cards/works/passages the answer needs. Output strict JSON.
2. **Plan memory**: `memory.plan(requiredItems)` → apply ops → emit `memory_ops` + SSE events so the panel animates *before/while* the answer streams.
3. **Synthesize** (frontier model): stream the answer with the assembled context. System prompt (from the pack) instructs inline provenance markers `[[p:passage_id]]` after claims.
4. **Post-process**: strip markers into `message_provenance`; render as provenance chips.
5. **Touch**: update `last_touched_at` on used items.

### 11.4 Retrieval fallback
If the router requests something with no card coverage (or low confidence), fall back to pgvector similarity over `summaries` to find candidate passages, hydrate top-k, and tag the memory op reason "retrieved — no concept card covered this." This keeps answers grounded and gives the README an honest paragraph contrasting retrieval-era vs memory-era UX inside one product.

> **HUMAN GATE H5 — interrupt policy.** Question to decide once the loop works: when the router wants to load an entire new work mid-conversation (big token swing), does the agent act and narrate, or pause and ask? Implement **act-and-narrate** first with a threshold constant (`ASK_ABOVE_TOKENS`, default: never ask), demo both, then Tobias picks. Record in decisions.md.


## 12. API surface (route handlers)

Thin handlers; logic lives in `lib/` and `worker/`.

- `POST /api/workspaces` — create workspace for a pack (triggers ingestion workflow if pack not yet ingested); returns workspace + ingest job id.
- `GET /api/ingest/:jobId/events` — SSE stream of ingestion events.
- `POST /api/w/:id/messages` — send a message; SSE response interleaving two event types: `memory_op` and `answer_delta`. (One stream, typed events — the panel and the conversation animate off the same wire.)
- `POST /api/w/:id/memory` — user memory ops: `{op: pin|unpin|evict|hydrate, itemType, itemId}`.
- `GET /api/w/:id/state` — full workspace hydration on load: working set, budget, shelf index, messages, starter prompts.
- `GET /api/w/:id/timeline` — activity timeline entries (from `events` + `memory_ops`), each with `otel_trace_id`.
- `GET /api/costs` — running cost meter data (§15).

## 13. UI spec

### 13.1 Layout

Three surfaces, one screen (min 1024px). Left: **corpus shelf** (collapsible, ~260px). Center: **conversation**. Right: **memory panel** (~340px, never collapsible — it is the product).

```
┌──────────┬──────────────────────────┬────────────────┐
│  SHELF   │      CONVERSATION        │  MEMORY PANEL  │
│ works by │  messages, provenance    │ budget meter   │
│ author,  │  chips, composer         │ pinned cards   │
│ ingest   │                          │ hydrated cards │
│ status   │                          │ compressed     │
│          │                          │ op feed        │
└──────────┴──────────────────────────┴────────────────┘
```

### 13.2 Memory panel behavior (the signature surface)

- **Budget meter** at top: used/total tokens, fills as items hydrate. Numbers visible on hover, not shouted.
- Cards in three visual states: **pinned** (pin glyph, immovable), **hydrated** (full opacity, passage count badge), **compressed** (reduced opacity, condensed height). Drill-down on click: card → underlying passages → exact text.
- **Swap animation** (the one place to spend motion budget): on eviction, a card visibly *condenses* (height + opacity ease, ~400ms); on hydration, it *unfolds*. Simultaneous swap reads as one choreographed motion: Hegel settles down as Plato opens up. Respect `prefers-reduced-motion` (crossfade fallback).
- **Op feed** at the panel's foot: the last few `memory_ops` reasons, verbatim, timestamped ("Compressed *Hegel: the dialectic* — needed room for *The Republic*").
- Drag a work from the shelf onto the panel → hydrate. Right-click/kebab per card → pin, evict, inspect passages.

### 13.3 Conversation surface

- Streaming answers; **provenance chips** inline or clustered at paragraph end (author + work + passage ordinal); clicking a chip opens the passage and flashes its parent card in the panel.
- While the router/memory plan runs (pre-stream), the composer shows a one-line status in domain language ("Bringing *Genealogy of Morals* into memory…") — never "thinking…".

### 13.4 Empty state (per the design decision already made)

Three elements, all data-driven from the workspace row:
1. **Promise line** (pack's `promiseLine`).
2. **Starter prompts as demonstrations** — the 5–6 ingestion-generated prompts, each labeled with the memory behavior it will trigger (cross-thinker · side-by-side hydration / sequential · cards accumulate / deep-dive · one work unfolds). Clicking one sends it.
3. **Ghost cards** in the memory panel: 3 faint placeholder outlines, caption "Concepts appear here as the model reads." Shelf is fully stocked; panel deliberately near-empty. Shelf full / memory empty / conversation waiting = the whole mental model in one glance.

> **HUMAN GATE H7 — promise line.** Agent implements with the draft line; Tobias writes ~10 candidates and swaps in the winner before any demo. Record in decisions.md.

### 13.5 Design direction

Subject: a reading room for ideas in motion. The design must not read as a default AI-chat skin, and specifically avoid the stock look (cream `#F4F1EA` + terracotta accent + high-contrast serif hero) and the near-black + acid-accent look.

- **Palette (tokens, name them in Tailwind config):** cool paper `#F7F6F2` background; graphite ink `#1F2328` text; slate structure lines `#D8D6CF`; single accent **verdigris** `#3E7C6F` reserved *exclusively* for memory state (budget meter, hydration glow, provenance chips) — the accent literally means "in memory"; warm amber `#B8860B` only for pinned state. No other saturated color anywhere.
- **Type:** body/corpus text in **Newsreader** (passages should feel like a book); UI chrome in **Inter**; passage ordinals and token counts in a mono (**JetBrains Mono**) at small sizes. Display moments (promise line) use Newsreader at high size, regular weight — confidence through scale, not boldness.
- **Signature element:** the memory panel's condense/unfold choreography. Everything else stays quiet — hairline dividers, generous line-height on corpus text, no cards-with-shadows-everywhere.
- Quality floor without announcing it: keyboard focus visible, reduced motion respected, panel usable at 1024px.

## 14. Observability (OpenTelemetry)

- Spans on: each Temporal activity, each router call, memory plan, synthesis call (with model, token counts, cost attrs), each API handler.
- Export OTLP → Jaeger (dev). Additionally, meaningful spans mirror into `events` so the **in-product activity timeline** (a drawer on the workspace) renders "what did it just do" without Jaeger: router decision → memory ops → synthesis, with durations. Each row deep-links to the Jaeger trace in dev.
- The timeline is a *product feature*, styled like the rest of the app — not a debug dump.

## 15. Model routing & cost

`lib/llm/routing.ts` — a single config object, hot-editable via the settings drawer:

| Job | Default route | Alt |
|---|---|---|
| Passage summaries | Ollama local (free) | Haiku via Batch API |
| Concept cards | Haiku (quality matters; cheap) | Sonnet |
| Starter prompt gen | Haiku | — |
| Router (per message) | Haiku | Ollama local |
| Synthesis (answers) | Sonnet, prompt caching ON | — |
| Embeddings | local (Ollama embed model) or voyage-lite | — |

- **Cost meter:** every provider call records tokens + computed cost to a `costs` table; settings drawer shows total, per-job breakdown, and per-conversation cost. Hard stop env var `MAX_SPEND_USD` (default 25) — paid calls refuse beyond it.
- Prompt caching: working-memory prefix ordering is stable (§10.2) precisely to exploit cache hits; log cache-hit rates as span attrs.

> **HUMAN GATE H4 — ingestion model verdict.** Decided by the eval in §16 before full-corpus ingestion runs.

## 16. Ingestion quality eval (`scripts/eval-ingestion.ts`) — run BEFORE full ingestion

1. Sample 20 passages stratified across authors/genres (dialogue, aphorism, treatise).
2. Generate summaries + one concept-card draft with: Ollama local, Haiku, Sonnet.
3. Output a blind-review HTML page (randomized, model names hidden) → Tobias scores 1–5 on faithfulness and usefulness → script unblinds and prints mean/deltas and projected full-corpus cost per route.
4. Verdict recorded in `docs/decisions.md` (this is H4). Check fixtures + results into `eval/` — the eval itself is portfolio material.

## 17. Build phases (Ralph-loop friendly: each phase is a clean-context task with a DONE check)

Each phase ends with: tests green, `pnpm lint && pnpm typecheck` clean, a one-paragraph note appended to `docs/ralph/progress.md`, and a git commit. Do not start a phase before the prior phase's HUMAN GATEs are recorded in `docs/decisions.md`.

- **P0 — Skeleton (no LLM):** repo, docker-compose, Next.js app boots, Temporal dev server + worker hello-world workflow, Drizzle migrations, OTel wired to Jaeger. DONE: a trivial workflow runs and its trace is visible.
- **P1 — Corpus:** `fetch-corpus.ts`, manifest, license table in README. DONE: all texts fetched, cleaned, checked in. *(Gate H1 opens after P2 chunk preview.)*
- **P2 — Chunking:** structure-aware chunker + per-author overrides behind config; chunk-preview CLI (`pnpm chunks --work republic --sample 10`). DONE: preview output for 3 works of different genres. **STOP → H1.**
- **P3 — Eval:** §16 end to end. **STOP → H4.**
- **P4 — Ingestion:** full Temporal pipeline with events, resumability (kill the worker mid-run in a test), ingest screen with live milestones + cost. DONE: full philosophy corpus ingested on the chosen route; screen demos well. **STOP → H2 review.**
- **P5 — Memory core:** working-memory manager, unit tests for plan/evict/pin/budget; deterministic context assembly. DONE: tests cover eviction ordering, pin inviolability, budget overflow.
- **P6 — Conversation loop:** router → plan → stream with interleaved SSE; provenance chips; retrieval fallback. DONE: cross-thinker question streams with visible memory ops. **STOP → H3 tune, H5 demo.**
- **P7 — The panel:** full memory panel with states, swap choreography, op feed, drag-from-shelf, drill-down. DONE: the Nietzsche-vs-Plato showpiece looks intentional on video.
- **P8 — Empty state & polish:** §13.4, settings drawer (routing + costs), activity timeline drawer, session persistence pass (return-next-week flow). **STOP → H7.**
- **P9 — Second pack proof:** Swift Evolution pack config + tiny corpus slice (20 proposals) to prove pack-agnosticism. DONE: same UI, different vocabulary, zero code changes outside `domain-packs/`.
- **P10 — Portfolio wrap:** README (thesis: retrieval-era vs memory-era UX; what's simulated vs real; corpus license table), 2-min demo script, `docs/ralph/` cleaned up as the AI-native-process appendix.

## 18. Acceptance criteria (the demo script is the test)

1. Fresh clone → quickstart → ingestion running with narrated milestones in under 15 minutes of human effort.
2. Kill the Temporal worker mid-ingestion; restart; ingestion resumes; UI shows only a quiet "resumed" note.
3. Empty workspace teaches the mental model with zero onboarding text beyond the promise line.
4. The cross-thinker starter prompt: two authors visibly hydrate side by side; answer streams with provenance chips; chips open exact passages.
5. Ask enough questions to blow the token budget: compression is visible, narrated, and pinned items survive.
6. Close the tab, reopen: conversation and memory state intact; an old card rehydrates on demand.
7. Settings drawer shows real per-job costs; total spend for the whole build ≤ $100.
8. `docs/decisions.md` contains a dated, reasoned verdict for H1–H7.

## 19. Notes for the implementing agent

- Ask at every HUMAN GATE; do not resolve gates yourself. Batch questions at phase boundaries.
- Prefer boring, readable TypeScript over cleverness; this repo will be read by hiring engineers.
- Never let domain strings leak outside `domain-packs/`. If a philosophy word appears in `components/` or `lib/`, that's a bug.
- Commit messages describe product behavior ("memory panel: condense animation on eviction"), not plumbing.
- If a dependency fights the spec (e.g., Tailwind v4 + a plugin), resolve in favor of the spec's product behavior and note the workaround in progress.md.

---
*End of Commonplace spec v1.0. Gates H1–H7 index: H1 chunking · H2 progress design · H3 eviction policy · H4 ingestion model · H5 interrupt policy · H7 promise line. (H6 reserved.)*
