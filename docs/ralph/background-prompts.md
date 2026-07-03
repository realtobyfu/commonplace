# Ready-to-run background agent prompts

Self-contained research prompts for work that doesn't depend on open HUMAN
GATEs. Paste into a separate (Sonnet) agent session; each writes its result
into the repo.

## 1. Swift Evolution pack corpus (unblocks P9 anytime)

> Research corpus sources for the "swift-evolution" domain pack of the
> Commonplace project at /Users/realtobyfu/Documents/Commonplace. Browse
> https://github.com/swiftlang/swift-evolution/tree/main/proposals and select
> 20 proposals that (a) are implemented in shipped Swift versions, (b) span
> several eras (Swift 3 → 6), and (c) include a few famously debated ones
> (e.g. SE-0110, SE-0296 async/await, SE-0306 actors, result builders,
> macros). For each: proposal id, title, authors, status, Swift version, and
> the raw.githubusercontent.com URL to the markdown file — verify each URL
> returns 200. Write the result as JSON to
> /Users/realtobyfu/Documents/Commonplace/swift-evolution-research.json with
> shape {verifiedAt, proposals: [{id, title, authors[], status, swiftVersion,
> rawUrl, notes}]}. Research only — do not write any project code.

## 2. ~~Anthropic + Voyage pricing~~ (superseded 2026-07-02)

Tobias replaced the Anthropic API with Groq for all paid jobs (see
`docs/decisions.md` "Provider amendment"). A background agent researched the
live Groq catalog, pricing, rate limits, caching, and per-job recommendations
into `docs/ralph/groq-research.md`.

## 3. ~~Gutenberg gap-filling for Hegel~~ (done 2026-07-02)

Handled by a background agent: Hegel (Wallace substitutes) and Rousseau were
verified into `corpus-research-additions.json` per Tobias's scope decisions —
see `docs/decisions.md` "Corpus scope amendments".
