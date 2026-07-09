# Demo script — two minutes

The §18 acceptance criteria, arranged as a walkthrough. Numbers in brackets
are rough elapsed seconds. Before recording: pick the H7 promise line, start
all four processes, and use a **fresh workspace** on the already-ingested
philosophy pack (`POST /api/workspaces` — it inherits starter prompts and
skips re-ingestion, so the empty state is pristine).

## Beat 1 — the empty state teaches the model [0:00–0:20]

Open the fresh workspace. Don't say anything yet; let the screen do it:

- Shelf fully stocked (18 works, six thinkers), memory panel deliberately
  near-empty — three ghost cards, "Concepts appear here as the model reads."
- The promise line, then six starter prompts, each labeled with the memory
  behavior it triggers.

*Line to say:* "The left side is everything that exists. The right side is
what the model is holding right now — nothing yet. That gap is the product."

## Beat 2 — the showpiece: cross-thinker hydration [0:20–1:10]

Click a **side-by-side hydration** starter prompt (Nietzsche × Schopenhauer
or Kant × Schopenhauer).

- Composer status line speaks in domain language ("Bringing *The Genealogy
  of Morals* into memory…").
- Two thinkers' cards **unfold into the panel while the answer streams** —
  the op feed narrates each load; the budget meter fills.
- The answer arrives with provenance chips. Click one: the exact passage
  opens in a reading overlay and its parent card flashes in the panel.

*Line to say:* "Every claim links to the passages that were actually in
memory when the sentence was written — not a search result after the fact."

## Beat 3 — pressure the budget: compression is visible [1:10–1:35]

Pin one card (it turns amber). Ask two more starter prompts back to back —
enough hydration to cross the 80K budget.

- A stale card visibly **condenses** (the one place the design spends its
  motion budget); the op feed explains why in a human sentence.
- The pinned card survives, by rule.

*Line to say:* "The agent manages memory, but the user's pin is inviolable —
and every eviction gets a reason written for humans, not a log line."

## Beat 4 — leave and come back [1:35–1:50]

Close the tab. Reopen the workspace URL.

- Conversation and working memory exactly as left — no "new chat" reset.
- Click a compressed card → it rehydrates on demand.

*Line to say:* "State is the point. You come back next week and the model is
still holding what you built together."

## Beat 5 — the receipts [1:50–2:00]

Open the activity timeline (clock icon), then the settings drawer:

- The turn reads as a story: router decision → memory ops → "Answered with
  N citations," each row deep-linking to its OTel trace.
- The spend section: the entire build — full 1.75M-word corpus ingested,
  every live test — cost about a quarter.

*Line to say:* "Everything you just watched is traced, and the whole thing
cost twenty-six cents to build."

## If asked "does it generalize?"

Open the Swift Evolution workspace: same UI, "Proposal" vocabulary, shelf
grouped by proposal author, concept cards about actors and ownership. Zero
code changes outside the pack config — chunking rules, prompts, vocabulary,
and starter prompts are all data.

## Reliability aside (have ready, don't lead with it)

Kill `pnpm worker` mid-ingestion on a fresh pack and restart it: ingestion
resumes with zero duplicate work, and the only thing the user ever sees is
one quiet "resumed after an interruption" note. Temporal's retries stay
invisible by design (H2).
