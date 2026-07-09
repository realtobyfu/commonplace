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

**Status: DECIDED 2026-07-09 (Tobias).** Confirmed as-is. The working
position ships unchanged: reliability machinery invisible; domain-language
milestones ("Finished *The Republic* — 198 passages…"); works checklist,
milestone ticker, elapsed time, and running cost on the ingest screen; no
percentage bar. The single permitted failure surface — one quiet "resumed
after an interruption" note — was proven live by the P9 kill-test (SIGKILL
mid-summarization → restart → exactly one note, zero duplicate work, zero
retry exposure). The design was exercised across two full pack ingestions
before sign-off.

## H3 — Eviction policy

**Status: DECIDED 2026-07-04 (Tobias).** Agent-managed-with-user-override
stands as the model (agent plans loads/evictions each turn; pins are
inviolable; the user can pin/evict/hydrate anytime). The tunables are now
per-workspace settings (a jsonb column, editable in the memory-settings
drawer — gear icon in the panel header), not constants:

- **Token budget: 80,000** (the spec default). Behaved well in the live
  cross-thinker demo — enough headroom that compression only kicks in on a
  genuinely loaded conversation, which is the honest behavior.
- **Staleness weighting: 1.0** (balanced). `evictToFit` scores each
  candidate `staleness * weight − importance`; at 1.0 recency and importance
  trade off evenly. Lower it toward 0 to evict by importance regardless of
  age; raise it to let the stalest cards compress first. Kept balanced as the
  default; the knob exists for demoing the difference.
- **Permission before large loads:** see H5 — the agent does *not* ask by
  default (act-and-narrate).

The values are defaults, not locks — the drawer lets any of them be retuned
live and the change applies on the next turn.

## H4 — Ingestion model

**Status: DECIDED 2026-07-02 (Tobias).** Decided by cost fiat, not the §16
blind eval — "let's just use the cheaper option honestly." With Groq's
pricing, the entire model-comparison question stopped being worth its build
time: full-corpus ingestion on `llama-3.1-8b-instant` costs ~$0.30 and the
priciest job (synthesis on `gpt-oss-120b`) is ~1¢ a turn. Routes: summaries →
Groq `llama-3.1-8b-instant`; router → `openai/gpt-oss-20b`; concept cards,
starter prompts, synthesis → `openai/gpt-oss-120b`; embeddings → Ollama
`nomic-embed-text` (Groq has no embeddings endpoint). The §16 eval script is
waived; P3 is folded into P4. If summary quality disappoints at H2 review,
the eval can be resurrected — routing is config.

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

**Status: DECIDED 2026-07-04 (Tobias).** **Act-and-narrate is the default.**
When the router wants to bring in a whole work mid-conversation, the agent
just does it and narrates the load in the op feed — the memory panel is where
you watch what happened, and interrupting the conversation to ask permission
adds friction for little gain in the common case.

The pause-and-ask alternative is fully built and kept behind the workspace's
`askAboveTokens` setting (off by default = never ask). When a threshold is
set, a turn whose new hydration exceeds it emits an `interrupt` and persists
nothing until the user answers "Bring it in / Cancel" in the composer;
approval re-sends with a bypass flag. Verified live at a 2,000-token
threshold (a Plato question wanted the *justice* card + a Republic summary,
~12.5k tokens → paused → approved → completed). Left in the settings drawer
precisely so the portfolio walkthrough can demo both behaviors on demand.

## H6 — (reserved)

## H7 — Promise line

**Status: DECIDED 2026-07-09 (Tobias).** The draft is the final line:

> **"A commonplace book that reads for you — six thinkers, one working
> memory, watch it think."**

The spec's plan was ~10 candidates with a swap before any demo; Tobias
elected to keep the draft, which survived the whole build (it held through
the corpus rebalance that restored the sixth thinker, and it's what every
philosophy workspace row already carries). No config or data change needed.
