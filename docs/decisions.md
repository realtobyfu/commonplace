# Decisions — HUMAN GATE outcomes

Every HUMAN GATE from the spec gets a dated, reasoned verdict here before the
dependent phase proceeds.

## Corpus scope amendments (2026-07-02, Tobias)

Amendments to the §8 source list after P1 fetch revealed gaps:

- **Schopenhauer trimmed** from 8 works to 3 (*World as Will and Idea* vol. 1,
  *The Wisdom of Life*, *Studies in Pessimism*). The Saunders "Essays" turned
  out to be seven separate Gutenberg volumes, putting one author at 34% of the
  corpus.
- **Hegel added via substitutes**: Wallace's *The Logic of Hegel* (#55108) and
  *Philosophy of Mind* (#39064). Sibree's *Philosophy of History* (the work
  the spec named) is not on Gutenberg; these are different works, flagged as
  substitutions in the manifest per §8.
- **Rousseau added** (not in the spec's original list): Cole's *The Social
  Contract & Discourses* and Foxley's *Emile* — both pre-1929 PD translations.
- **Kaufmann's Nietzsche translations rejected** — still in copyright; the PD
  Common/Zimmern/Samuel/Mencken translations stand. Heidegger and Horkheimer
  remain permanently excluded per §3.
- Net effect: six thinkers again (Plato, Nietzsche, Kant, Schopenhauer, Hegel,
  Rousseau), so the draft H7 promise line's "six thinkers" holds.

## H1 — Chunking scheme

**Status: DECIDED 2026-07-02 (Tobias).** Per-author logic stays — the preview
distributions showed the three strategies doing genuinely different work
(Republic exchanges clustering 600–900, Nietzsche aphorisms intact with wide
natural variance, Kant at the ~1000 treatise target), which one general
scheme would flatten. Two amendments from the preview review, both accepted:
(1) front matter — contents pages, title-page lines, and translator
introductions (Jowett's ~90k-word "Introduction and Analysis") — is skipped
via per-author `skipHeadings` patterns rather than chunked as body text, so
translator commentary can never carry an author's provenance chip; (2) single
paragraphs exceeding the soft cap are split at sentence boundaries instead of
shipping ~2000-token outliers.

## H2 — Progress design

**Status: OPEN.** Reviewed after P4 ingest screen is live. Working position:
reliability machinery invisible; domain-language milestones; quiet "resumed
after interruption" note as the only failure surface; no percentage bar.

## H3 — Eviction policy

**Status: OPEN.** Tuned after the first end-to-end conversation (P6): budget
size, staleness weighting, permission-before-large-loads.

## H4 — Ingestion model

**Status: OPEN.** Decided by the §16 blind eval (P3) before full ingestion.
Candidate routes updated by the provider amendment below: Ollama local vs.
Groq small vs. Groq large (was: Ollama vs. Haiku vs. Sonnet).

## Provider amendment — Groq replaces the Anthropic API (2026-07-02, Tobias)

The spec's §5/§15 paid route (Anthropic Haiku/Sonnet) is replaced by **Groq**
(OpenAI-compatible API, low per-token cost) for all paid jobs: router, concept
cards, starter prompts, synthesis. Reason: cost — the corpus is 1.75M words
and frontier-model synthesis pricing dominates the §15 budget. Ollama remains
the free local route for bulk summaries and embeddings (Groq serves no
embeddings endpoint). The provider abstraction in `lib/llm/` keeps Anthropic
re-enableable as config if quality demands it later; `MAX_SPEND_USD` applies
to Groq spend. Model choices per job come from `docs/ralph/groq-research.md`
plus the H4 eval.

## H5 — Interrupt policy

**Status: OPEN.** Act-and-narrate implemented first (`ASK_ABOVE_TOKENS`,
default: never ask); both behaviors demoed after P6.

## H6 — (reserved)

## H7 — Promise line

**Status: OPEN.** Draft in use: "A commonplace book that reads for you — six
thinkers, one working memory, watch it think." Tobias swaps in the winner
before any demo (P8).
