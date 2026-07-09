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

## Retrieval-era vs. memory-era UX

Most LLM products treat context as invisible plumbing: every question triggers
a fresh retrieval pass, top-k chunks are stuffed into the prompt, and the
state evaporates between turns. The user never learns what the model was
looking at, so they can't correct it when it looks at the wrong thing.

Commonplace inverts that. The working set **persists** — across turns and
across sessions — and it's **visible and steerable**: the panel shows every
card the model holds, the agent narrates each hydration and eviction in plain
language, pins are inviolable, and provenance chips link every claim to the
exact passages that were in memory when the sentence was written. Context
stops being plumbing and becomes the product surface.

Both eras coexist honestly in this codebase. When a question is covered by a
concept card, the router hydrates it — that's the memory era. When nothing
covers it, the app falls back to pgvector similarity over passage summaries
and *says so* in the op feed ("retrieved; no concept card covered this") —
that's the retrieval era, kept as a labeled exception path rather than the
architecture.

## Quickstart

Four long-running processes, one terminal each — the corpus texts and
manifests are already checked into `corpus/`, so no fetch step is needed on
a fresh clone.

```sh
# 0. one-time setup
cp .env.example .env          # add your GROQ_API_KEY (free: console.groq.com)
pnpm install
docker compose up -d          # postgres (pgvector) + jaeger
pnpm db:migrate
```

```sh
# 1. Temporal dev server (its own terminal)
temporal server start-dev
```

```sh
# 2. Temporal worker (its own terminal — picks up .env)
pnpm worker
```

```sh
# 3. Next.js app (its own terminal)
pnpm dev
```

Verify the plumbing: `pnpm tsx scripts/run-hello.ts` runs a trivial workflow;
its trace appears in Jaeger at <http://localhost:16686>.

### Open a workspace

The home page (`/`) is a placeholder — the real app lives at `/w/<id>`, and a
workspace is created via the API (there's no "new workspace" button yet):

```sh
curl -X POST http://localhost:3000/api/workspaces \
  -H "content-type: application/json" \
  -d '{"packId":"philosophy"}'
```

This returns `{ workspace: { id, ... }, ingestJobId }`. If the pack hasn't
been ingested yet, `ingestJobId` is non-null — watch it narrate at
`http://localhost:3000/ingest/<workspace.id>`. Once ingestion finishes (or
immediately, if it was already done — a fresh workspace on an ingested pack
inherits its starter prompts and skips re-ingestion), open
`http://localhost:3000/w/<workspace.id>`.

Swap `"packId":"swift-evolution"` for the second domain pack (P9's
generalization proof — same UI, Swift Evolution proposals instead of
philosophy).

## Corpus

Public-domain English translations from Project Gutenberg only (`pnpm
fetch-corpus` downloads, cleans, and writes `corpus/manifest.json`). All works
below are public domain in the USA; per-work license basis is recorded in the
manifest.

| Thinker | Work | Translator | Gutenberg | Words |
|---|---|---|---|---|
| Plato | *The Republic* | Benjamin Jowett | #1497 | 216,285 |
| Plato | *Symposium* | Benjamin Jowett | #1600 | 32,593 |
| Plato | *Phaedo* | Benjamin Jowett | #1658 | 42,778 |
| Plato | *Apology* | Benjamin Jowett | #1656 | 16,094 |
| Plato | *Phaedrus* | Benjamin Jowett | #1636 | 38,138 |
| Friedrich Nietzsche | *Thus Spake Zarathustra* | Thomas Common | #1998 | 110,900 |
| Friedrich Nietzsche | *Beyond Good and Evil* | Helen Zimmern | #4363 | 62,667 |
| Friedrich Nietzsche | *The Genealogy of Morals* | Horace B. Samuel | #52319 | 55,347 |
| Friedrich Nietzsche | *The Antichrist* | H. L. Mencken | #19322 | 33,664 |
| Immanuel Kant | *Critique of Pure Reason* | J. M. D. Meiklejohn | #4280 | 209,061 |
| Immanuel Kant | *Fundamental Principles of the Metaphysic of Morals* | T. K. Abbott | #5682 | 30,798 |
| Arthur Schopenhauer | *The World as Will and Idea (Vol. 1 of 3)* | R. B. Haldane and J. Kemp | #38427 | 190,615 |
| Arthur Schopenhauer | *The Wisdom of Life* | T. Bailey Saunders | #10741 | 38,151 |
| Arthur Schopenhauer | *Studies in Pessimism* | T. Bailey Saunders | #10732 | 30,567 |
| G. W. F. Hegel | *The Logic of Hegel* † | William Wallace | #55108 | 151,199 |
| G. W. F. Hegel | *Hegel's Philosophy of Mind* † | William Wallace | #39064 | 116,467 |
| Jean-Jacques Rousseau | *The Social Contract & Discourses* | G. D. H. Cole | #46333 | 123,505 |
| Jean-Jacques Rousseau | *Emile, or On Education* | Barbara Foxley | #5427 | 251,977 |

**18 works, six thinkers, 1,750,806 words.**

† Substitutions: the spec named Sibree's *The Philosophy of History*, which is
not on Project Gutenberg; Wallace's clearly-PD Encyclopaedia translations
stand in for Hegel (recorded in `corpus/manifest.json`).

**Exclusions** (license hard rule: if status is unclear, exclude):

- **Hegel, *Science of Logic*** — no public-domain English translation exists
  in a proofread edition (Johnston & Struthers 1929 is unclear; Miller and di
  Giovanni are copyrighted).
- **Kierkegaard** — no complete public-domain English translation of any
  standard work exists on Gutenberg; the standard Swenson/Lowrie and Hong
  translations are still in copyright. (Hollander's 1923 *Selections from the
  Writings of Kierkegaard*, #60333, is genuinely PD but an abridged anthology.)
- **Rousseau, *The Confessions*** (#3913) — the translation's authorship is
  unverifiable (the "S. W. Orson" attribution appears to be a metadata error),
  so its provenance fails the hard rule.
- **Kaufmann's Nietzsche translations** were requested and rejected — still in
  copyright; the PD Common/Zimmern/Samuel/Mencken translations stand.

### Second pack: Swift Evolution

The generalization proof (P9): 20 Swift Evolution proposals (~94K words,
Swift 3→6) ingested through the identical pipeline — same chunker (markdown
headings instead of Gutenberg-uppercase ones), same card synthesis, same UI
with "Proposal" vocabulary from the pack config. Proposal texts are Apache License 2.0 with Runtime Library Exception (from
[swiftlang/swift-evolution](https://github.com/swiftlang/swift-evolution));
per-proposal authorship and license notes live in
`corpus/swift-evolution/manifest.json`. Zero code changes outside
`domain-packs/` and `corpus/`.

## Development

- `pnpm typecheck && pnpm lint && pnpm test` — the phase-exit bar.
- `docs/decisions.md` — dated HUMAN GATE verdicts (H1–H7).
- `docs/ralph/progress.md` — one paragraph per completed build phase.
