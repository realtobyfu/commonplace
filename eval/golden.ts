/**
 * Golden set for retrieval evaluation.
 *
 * Each item is a reader's question paired with the author(s) whose passages a
 * good retrieval SHOULD surface — the ground truth. Author-level (not
 * exact-passage) expectations on purpose: a concept spans many passages, so
 * "did we reach the right thinker" is both robust to author and the thing that
 * actually matters for a grounded answer. Author slugs match works.author in
 * the DB exactly (see the pack manifests).
 *
 * The set is deliberately spread across three kinds so the keyword-vs-semantic
 * comparison in eval/retrieval.ts is meaningful, not flattering:
 *   - single      one thinker, vocabulary close to the corpus (keyword can win)
 *   - paraphrase  one thinker, asked in words the corpus doesn't use (semantic
 *                 should win; keyword should visibly whiff)
 *   - cross       spans thinkers (the architecture's signature case)
 *
 * Both packs are represented so the eval proves generalization the way P9 did.
 */

export interface GoldenItem {
  id: string;
  pack: "philosophy" | "swift-evolution";
  question: string;
  /** Author slug(s) a correct retrieval should surface; ≥1 present = a hit. */
  expectAuthors: string[];
  kind: "single" | "paraphrase" | "cross";
  /** Why these authors — the human-legible answer key. */
  note: string;
}

export const GOLDEN: GoldenItem[] = [
  // ---- philosophy: single ----
  {
    id: "phil-justice",
    pack: "philosophy",
    question: "What is justice, and why should a person be just?",
    expectAuthors: ["plato"],
    kind: "single",
    note: "The Republic is the corpus's sustained treatment of justice.",
  },
  {
    id: "phil-categorical",
    pack: "philosophy",
    question: "What does Kant mean by the categorical imperative?",
    expectAuthors: ["kant"],
    kind: "single",
    note: "Fundamental Principles of the Metaphysic of Morals.",
  },
  {
    id: "phil-nietzsche-morality",
    pack: "philosophy",
    question: "What is the critique of Christian and slave morality?",
    expectAuthors: ["nietzsche"],
    kind: "single",
    note: "The Antichrist / The Genealogy of Morals.",
  },
  {
    id: "phil-social-contract",
    pack: "philosophy",
    question: "How does legitimate political authority arise from the general will?",
    expectAuthors: ["rousseau"],
    kind: "single",
    note: "The Social Contract & Discourses.",
  },
  // ---- philosophy: paraphrase (corpus-avoidant vocabulary) ----
  {
    id: "phil-craving-suffering",
    pack: "philosophy",
    question: "Why does endless craving leave us perpetually dissatisfied?",
    expectAuthors: ["schopenhauer"],
    kind: "paraphrase",
    note: "Schopenhauer's will-and-suffering; asked without the words 'will' or 'pessimism'.",
  },
  {
    id: "phil-duty-outcome",
    pack: "philosophy",
    question: "Is doing the right thing about the result, or about the intention behind it?",
    expectAuthors: ["kant"],
    kind: "paraphrase",
    note: "Kantian duty vs consequences, phrased plainly.",
  },
  {
    id: "phil-soul-death",
    pack: "philosophy",
    question: "Does anything of us persist after the body dies?",
    expectAuthors: ["plato", "schopenhauer", "rousseau"],
    kind: "paraphrase",
    note:
      "Phaedo on the immortality of the soul — but inspecting actual retrievals " +
      "showed the corpus also covers this squarely in Schopenhauer (World as Will " +
      "§§354-420, on death and the afterlife) and Rousseau (Emile §216, an " +
      "immortality argument). Key widened accordingly; plato-only was wrong.",
  },
  // ---- philosophy: cross-thinker ----
  {
    id: "phil-thing-in-itself",
    pack: "philosophy",
    question: "How do Kant and Schopenhauer differ on the thing-in-itself?",
    expectAuthors: ["kant", "schopenhauer"],
    kind: "cross",
    note: "Directly names both; the 'thing-in-itself' card scopes kant+schopenhauer.",
  },
  {
    id: "phil-will-cross",
    pack: "philosophy",
    question: "Compare how Nietzsche and Schopenhauer understand the will.",
    expectAuthors: ["nietzsche", "schopenhauer"],
    kind: "cross",
    note: "The 'will' card scopes nietzsche+kant+schopenhauer.",
  },

  // ---- swift-evolution: single ----
  {
    id: "swift-async",
    pack: "swift-evolution",
    question: "What does the async/await proposal add to Swift?",
    expectAuthors: ["john-mccall"],
    kind: "single",
    note: "SE-0296 Async/await.",
  },
  {
    id: "swift-result-builders",
    pack: "swift-evolution",
    question: "What problem do result builders solve?",
    expectAuthors: ["john-mccall"],
    kind: "single",
    note: "SE-0289 Result builders.",
  },
  {
    id: "swift-macros",
    pack: "swift-evolution",
    question: "What are expression macros and what can they generate?",
    expectAuthors: ["doug-gregor"],
    kind: "single",
    note: "SE-0382 Expression Macros.",
  },
  // ---- swift-evolution: paraphrase ----
  {
    id: "swift-data-races",
    pack: "swift-evolution",
    question: "How does Swift stop two tasks from touching the same mutable state at once?",
    expectAuthors: ["chris-lattner", "john-mccall", "joe-groff"],
    kind: "paraphrase",
    note: "Sendable / actors / concurrency — asked without those exact terms.",
  },
  {
    id: "swift-noncopyable",
    pack: "swift-evolution",
    question: "Can a Swift type forbid being duplicated, so there's only ever one of it?",
    expectAuthors: ["joe-groff", "michael-gottesman"],
    kind: "paraphrase",
    note: "SE-0390 noncopyable / SE-0377 borrowing & consuming; no 'noncopyable' keyword.",
  },
  // ---- swift-evolution: cross ----
  {
    id: "swift-ownership-cross",
    pack: "swift-evolution",
    question: "How did Swift's approach to memory ownership and exclusive access develop?",
    expectAuthors: ["joe-groff", "john-mccall", "michael-gottesman"],
    kind: "cross",
    note: "Ownership card spans these; SE-0176 exclusive access is john-mccall.",
  },
];
