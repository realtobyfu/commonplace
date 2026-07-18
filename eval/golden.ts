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
  /** Human-reviewed passages that directly support a strong answer. */
  relevantPassageIds: string[];
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
    relevantPassageIds: [
      "473e3a15-cfaa-4560-9fde-40f36274bbec",
      "4610befe-2253-4664-9961-ff7f9c133727",
      "143b6ee6-8703-4792-b9f4-6b0d11443cb7",
    ],
    kind: "single",
    note: "The Republic is the corpus's sustained treatment of justice.",
  },
  {
    id: "phil-categorical",
    pack: "philosophy",
    question: "What does Kant mean by the categorical imperative?",
    expectAuthors: ["kant"],
    relevantPassageIds: [
      "65c0f8ac-f783-466c-bbfe-aa14c0cbc726",
      "fa239bd0-32a7-49cc-bc39-665fd6861fbe",
      "17bd4cad-a735-40bb-acbf-62adb0acf8d8",
    ],
    kind: "single",
    note: "Fundamental Principles of the Metaphysic of Morals.",
  },
  {
    id: "phil-nietzsche-morality",
    pack: "philosophy",
    question: "What is the critique of Christian and slave morality?",
    expectAuthors: ["nietzsche"],
    relevantPassageIds: [
      "c6c63df3-e74d-4305-9d8b-fb5b8442dccd",
      "b0dcecec-c732-4512-9127-c8dcafd8298a",
      "1b28a8a6-b662-4f77-ba24-13bf6e687013",
    ],
    kind: "single",
    note: "The Antichrist / The Genealogy of Morals.",
  },
  {
    id: "phil-social-contract",
    pack: "philosophy",
    question: "How does legitimate political authority arise from the general will?",
    expectAuthors: ["rousseau"],
    relevantPassageIds: [
      "3772c8b4-6cc8-4ba6-affb-75e9d8263c40",
      "8cc071aa-1998-445c-a3a4-ff174063625b",
      "90fab864-8465-43ec-a330-9af2c1655838",
      "6ebd9d34-18c0-4419-a748-71343e432b48",
    ],
    kind: "single",
    note: "The Social Contract & Discourses.",
  },
  // ---- philosophy: paraphrase (corpus-avoidant vocabulary) ----
  {
    id: "phil-craving-suffering",
    pack: "philosophy",
    question: "Why does endless craving leave us perpetually dissatisfied?",
    expectAuthors: ["schopenhauer"],
    relevantPassageIds: [
      "b6aef28e-60d4-4e9a-939a-a44195561bc9",
      "59ab555f-8d53-40eb-8b4c-79a5187d07a4",
      "6db5cb9e-0cf8-4b07-978a-2c02a3196485",
    ],
    kind: "paraphrase",
    note: "Schopenhauer's will-and-suffering; asked without the words 'will' or 'pessimism'.",
  },
  {
    id: "phil-duty-outcome",
    pack: "philosophy",
    question: "Is doing the right thing about the result, or about the intention behind it?",
    expectAuthors: ["kant"],
    relevantPassageIds: [
      "bd808c09-aea8-4923-9349-a317d8c003b3",
      "525a81ab-48aa-4945-8a85-892827ac7a22",
      "1765dae2-4846-4b12-84fd-b88507e4b53a",
    ],
    kind: "paraphrase",
    note: "Kantian duty vs consequences, phrased plainly.",
  },
  {
    id: "phil-soul-death",
    pack: "philosophy",
    question: "Does anything of us persist after the body dies?",
    expectAuthors: ["plato", "schopenhauer", "rousseau"],
    relevantPassageIds: [
      "c85f4ba0-7c69-4f86-8108-9ca760a7478e",
      "e838370d-8da2-41e0-84b5-d274eb44d65c",
      "a8c5e23e-dc6b-4d46-85a8-6e591c244c5c",
      "874ed669-c5cd-426a-bd63-d6479a57a0bb",
    ],
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
    relevantPassageIds: [
      "b3117e27-291c-4fa2-b0ea-cca1564bbb81",
      "21766e9a-7c2c-4bb7-93ae-1063d3f1426a",
      "101f18ef-0c3f-4eb7-a89b-0b2b16ce5b46",
      "2aff8a31-a83c-4eda-af90-6afa103c5545",
    ],
    kind: "cross",
    note: "Directly names both; the 'thing-in-itself' card scopes kant+schopenhauer.",
  },
  {
    id: "phil-will-cross",
    pack: "philosophy",
    question: "Compare how Nietzsche and Schopenhauer understand the will.",
    expectAuthors: ["nietzsche", "schopenhauer"],
    relevantPassageIds: [
      "77141774-b9cd-4fd0-b8a8-86b901665f90",
      "557a5c3c-917f-4b09-a6e6-4ef9b30d41b7",
      "2aff8a31-a83c-4eda-af90-6afa103c5545",
      "b6aef28e-60d4-4e9a-939a-a44195561bc9",
    ],
    kind: "cross",
    note: "The 'will' card scopes nietzsche+kant+schopenhauer.",
  },

  // ---- swift-evolution: single ----
  {
    id: "swift-async",
    pack: "swift-evolution",
    question: "What does the async/await proposal add to Swift?",
    expectAuthors: ["john-mccall"],
    relevantPassageIds: [
      "9f7340fe-64be-490d-8a0a-6740383ce1e6",
      "a75f87eb-3ed8-4417-a16f-a07eabb026f1",
      "49099c40-6140-4b5b-9edd-5007584e696e",
    ],
    kind: "single",
    note: "SE-0296 Async/await.",
  },
  {
    id: "swift-result-builders",
    pack: "swift-evolution",
    question: "What problem do result builders solve?",
    expectAuthors: ["john-mccall"],
    relevantPassageIds: [
      "1c2ee6e1-7aca-4c9f-836d-943c5821572f",
      "6a88ec8b-d131-475b-a694-8c131ac6b8e5",
      "42b352fc-2b71-466c-9b68-31aad05297e3",
    ],
    kind: "single",
    note: "SE-0289 Result builders.",
  },
  {
    id: "swift-macros",
    pack: "swift-evolution",
    question: "What are expression macros and what can they generate?",
    expectAuthors: ["doug-gregor"],
    relevantPassageIds: [
      "dd23e71d-d69a-4847-aab7-247f1e7107c2",
      "2b64da52-0920-4e1f-a1e3-9f7583c51dd4",
      "f0c6babc-7055-4b4a-9afe-409efe8941a5",
    ],
    kind: "single",
    note: "SE-0382 Expression Macros.",
  },
  // ---- swift-evolution: paraphrase ----
  {
    id: "swift-data-races",
    pack: "swift-evolution",
    question: "How does Swift stop two tasks from touching the same mutable state at once?",
    expectAuthors: ["chris-lattner", "john-mccall", "joe-groff"],
    relevantPassageIds: [
      "d665e25b-0944-45ff-987d-93e4c1effdb3",
      "4db4d70e-ff57-4c6f-8832-08cc981ee136",
    ],
    kind: "paraphrase",
    note: "Sendable / actors / concurrency — asked without those exact terms.",
  },
  {
    id: "swift-noncopyable",
    pack: "swift-evolution",
    question: "Can a Swift type forbid being duplicated, so there's only ever one of it?",
    expectAuthors: ["joe-groff", "michael-gottesman"],
    relevantPassageIds: [
      "b11fa364-2289-4df2-b092-bb6c0d9f3dc8",
      "ffe02512-d064-4792-b6aa-f01998a9355c",
      "70d3d466-232d-4e7e-8a93-75a9df8f9bdf",
    ],
    kind: "paraphrase",
    note: "SE-0390 noncopyable / SE-0377 borrowing & consuming; no 'noncopyable' keyword.",
  },
  // ---- swift-evolution: cross ----
  {
    id: "swift-ownership-cross",
    pack: "swift-evolution",
    question: "How did Swift's approach to memory ownership and exclusive access develop?",
    expectAuthors: ["joe-groff", "john-mccall", "michael-gottesman"],
    relevantPassageIds: [
      "4c947e77-4f4c-41fe-87ad-28c5be95cbc7",
      "4b602e60-d63e-499c-8a84-6ffdea78920c",
      "ffe02512-d064-4792-b6aa-f01998a9355c",
      "c3ea857e-3137-40ba-a1f8-3ea8d4472269",
    ],
    kind: "cross",
    note: "Ownership card spans these; SE-0176 exclusive access is john-mccall.",
  },
];
