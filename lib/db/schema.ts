import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

export const workStatus = pgEnum("work_status", [
  "pending",
  "chunking",
  "summarizing",
  "embedding",
  "ingested",
  "failed",
]);

export const works = pgTable(
  "works",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    packId: text("pack_id").notNull(),
    author: text("author").notNull(),
    title: text("title").notNull(),
    translator: text("translator"),
    licenseNote: text("license_note").notNull(),
    sourceFile: text("source_file").notNull(),
    wordCount: integer("word_count").notNull().default(0),
    status: workStatus("status").notNull().default("pending"),
  },
  (t) => [uniqueIndex("works_pack_title_idx").on(t.packId, t.author, t.title)],
);

export const passages = pgTable(
  "passages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workId: uuid("work_id")
      .notNull()
      .references(() => works.id),
    ordinal: integer("ordinal").notNull(),
    text: text("text").notNull(),
    heading: text("heading"),
    charStart: integer("char_start").notNull(),
    charEnd: integer("char_end").notNull(),
    tokenCount: integer("token_count").notNull(),
    embedding: vector("embedding", { dimensions: 768 }),
  },
  (t) => [uniqueIndex("passages_work_ordinal_idx").on(t.workId, t.ordinal)],
);

export const summaries = pgTable("summaries", {
  passageId: uuid("passage_id")
    .primaryKey()
    .references(() => passages.id),
  text: text("text").notNull(),
  model: text("model").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const conceptCards = pgTable("concept_cards", {
  id: uuid("id").primaryKey().defaultRandom(),
  packId: text("pack_id").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  authorScope: text("author_scope").array().notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const cardPassages = pgTable(
  "card_passages",
  {
    cardId: uuid("card_id")
      .notNull()
      .references(() => conceptCards.id),
    passageId: uuid("passage_id")
      .notNull()
      .references(() => passages.id),
    weight: doublePrecision("weight").notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.cardId, t.passageId] })],
);

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  packId: text("pack_id").notNull(),
  promiseLine: text("promise_line").notNull(),
  starterPrompts: jsonb("starter_prompts"),
  // H3/H5 tunables: token budget, staleness-vs-importance weighting, and the
  // ask-before-large-load threshold. Null = use defaults (lib/workspace/settings).
  settings: jsonb("settings"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const memoryItemType = pgEnum("memory_item_type", [
  "card",
  "passage",
  "work_summary",
]);

export const memoryItemState = pgEnum("memory_item_state", [
  "hydrated",
  "compressed",
]);

export const workingMemoryItems = pgTable(
  "working_memory_items",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    itemType: memoryItemType("item_type").notNull(),
    itemId: uuid("item_id").notNull(),
    state: memoryItemState("state").notNull().default("hydrated"),
    pinned: boolean("pinned").notNull().default(false),
    loadedAt: timestamp("loaded_at").notNull().defaultNow(),
    lastTouchedAt: timestamp("last_touched_at").notNull().defaultNow(),
    // monotonic turn counter mirror of last_touched_at — what lib/memory's
    // staleness ordering and "untouched for N turns" reasons run on
    lastTouchedTurn: integer("last_touched_turn").notNull().default(0),
    tokenCost: integer("token_cost").notNull(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.itemType, t.itemId] })],
);

export const messageRole = pgEnum("message_role", ["user", "assistant"]);

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  role: messageRole("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const messageProvenance = pgTable(
  "message_provenance",
  {
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id),
    passageId: uuid("passage_id")
      .notNull()
      .references(() => passages.id),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.passageId] })],
);

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id),
  kind: text("kind").notNull(),
  domainMessage: text("domain_message").notNull(),
  otelTraceId: text("otel_trace_id"),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const memoryOp = pgEnum("memory_op", [
  "hydrate",
  "evict",
  "pin",
  "unpin",
]);

export const memoryOpActor = pgEnum("memory_op_actor", ["agent", "user"]);

export const memoryOps = pgTable("memory_ops", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  op: memoryOp("op").notNull(),
  itemType: memoryItemType("item_type").notNull(),
  itemId: uuid("item_id").notNull(),
  actor: memoryOpActor("actor").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const costs = pgTable("costs", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id),
  job: text("job").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
  costUsd: doublePrecision("cost_usd").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
