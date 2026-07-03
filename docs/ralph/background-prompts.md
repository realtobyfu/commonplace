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

## 2. Current Anthropic + Voyage pricing table (feeds §15 cost meter, P3+)

> Research current API pricing needed by the Commonplace cost meter. From
> docs.anthropic.com (and voyageai.com for embeddings): per-MTok input/output
> prices for claude-haiku-4-5 and claude-sonnet-5 (or whatever the current
> cheap/frontier tier names are), prompt-caching write/read multipliers,
> Message Batches API discount, and voyage-3-lite embedding pricing. Write
> /Users/realtobyfu/Documents/Commonplace/docs/ralph/pricing-research.md with
> a table (model, $/MTok in, $/MTok out, cache write, cache read, batch
> discount, source URL per row, retrieved date). Research only — no code.

## 3. Gutenberg gap-filling IF Tobias wants Hegel coverage (feeds H7 decision)

> In /Users/realtobyfu/Documents/Commonplace/corpus-research.json, Hegel was
> excluded because Sibree's Philosophy of History is not on Project
> Gutenberg. Verify the two candidate substitutes on gutenberg.org: "The
> Logic of Hegel" trans. William Wallace (#55108) and "Hegel's Philosophy of
> Mind" trans. Wallace (#39064) — confirm translator, publication year
> (pre-1929), working plaintext URL, and standard START/END markers, exactly
> like the existing entries in corpus-research.json. Append them to that
> file's works array with verdict SUBSTITUTE and a note that they are
> different works than the spec named. Do not modify any other file.
