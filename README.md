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
| Arthur Schopenhauer | *Counsels and Maxims* | T. Bailey Saunders | #10715 | 45,501 |
| Arthur Schopenhauer | *The Art of Controversy* | T. Bailey Saunders | #10731 | 30,143 |
| Arthur Schopenhauer | *On Human Nature* | T. Bailey Saunders | #10739 | 32,238 |
| Arthur Schopenhauer | *Religion: A Dialogue, Etc.* | T. Bailey Saunders | #10833 | 29,452 |
| Arthur Schopenhauer | *The Art of Literature* | T. Bailey Saunders | #10714 | 37,465 |

**19 works, 1,282,457 words.**

**Exclusions** (license hard rule: if status is unclear, exclude):

- **Hegel** — Sibree's *The Philosophy of History* is not on Project Gutenberg
  at all (don't confuse it with *Lectures on the History of Philosophy*, a
  different work), and no public-domain English *Science of Logic* exists in a
  proofread edition. Candidate substitutes exist on Gutenberg (Wallace's 1892
  *The Logic of Hegel* #55108, *Hegel's Philosophy of Mind* #39064) but are
  different works — pending an explicit scope decision.
- **Kierkegaard** — no complete public-domain English translation of any
  standard work exists on Gutenberg; the standard Swenson/Lowrie and Hong
  translations are still in copyright. (Hollander's 1923 *Selections from the
  Writings of Kierkegaard*, #60333, is genuinely PD but an abridged anthology.)

## Development

- `pnpm typecheck && pnpm lint && pnpm test` — the phase-exit bar.
- `docs/decisions.md` — dated HUMAN GATE verdicts (H1–H7).
- `docs/ralph/progress.md` — one paragraph per completed build phase.
