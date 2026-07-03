CREATE TYPE "public"."memory_item_state" AS ENUM('hydrated', 'compressed');--> statement-breakpoint
CREATE TYPE "public"."memory_item_type" AS ENUM('card', 'passage', 'work_summary');--> statement-breakpoint
CREATE TYPE "public"."memory_op" AS ENUM('hydrate', 'evict', 'pin', 'unpin');--> statement-breakpoint
CREATE TYPE "public"."memory_op_actor" AS ENUM('agent', 'user');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."work_status" AS ENUM('pending', 'chunking', 'summarizing', 'embedding', 'ingested', 'failed');--> statement-breakpoint
CREATE TABLE "card_passages" (
	"card_id" uuid NOT NULL,
	"passage_id" uuid NOT NULL,
	"weight" double precision DEFAULT 1 NOT NULL,
	CONSTRAINT "card_passages_card_id_passage_id_pk" PRIMARY KEY("card_id","passage_id")
);
--> statement-breakpoint
CREATE TABLE "concept_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pack_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"author_scope" text[] NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"job" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" double precision NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"kind" text NOT NULL,
	"domain_message" text NOT NULL,
	"otel_trace_id" text,
	"payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_ops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"op" "memory_op" NOT NULL,
	"item_type" "memory_item_type" NOT NULL,
	"item_id" uuid NOT NULL,
	"actor" "memory_op_actor" NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_provenance" (
	"message_id" uuid NOT NULL,
	"passage_id" uuid NOT NULL,
	CONSTRAINT "message_provenance_message_id_passage_id_pk" PRIMARY KEY("message_id","passage_id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"role" "message_role" NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"text" text NOT NULL,
	"heading" text,
	"char_start" integer NOT NULL,
	"char_end" integer NOT NULL,
	"token_count" integer NOT NULL,
	"embedding" vector(768)
);
--> statement-breakpoint
CREATE TABLE "summaries" (
	"passage_id" uuid PRIMARY KEY NOT NULL,
	"text" text NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "working_memory_items" (
	"workspace_id" uuid NOT NULL,
	"item_type" "memory_item_type" NOT NULL,
	"item_id" uuid NOT NULL,
	"state" "memory_item_state" DEFAULT 'hydrated' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"loaded_at" timestamp DEFAULT now() NOT NULL,
	"last_touched_at" timestamp DEFAULT now() NOT NULL,
	"token_cost" integer NOT NULL,
	CONSTRAINT "working_memory_items_workspace_id_item_type_item_id_pk" PRIMARY KEY("workspace_id","item_type","item_id")
);
--> statement-breakpoint
CREATE TABLE "works" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pack_id" text NOT NULL,
	"author" text NOT NULL,
	"title" text NOT NULL,
	"translator" text,
	"license_note" text NOT NULL,
	"word_count" integer DEFAULT 0 NOT NULL,
	"status" "work_status" DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pack_id" text NOT NULL,
	"promise_line" text NOT NULL,
	"starter_prompts" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "card_passages" ADD CONSTRAINT "card_passages_card_id_concept_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."concept_cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_passages" ADD CONSTRAINT "card_passages_passage_id_passages_id_fk" FOREIGN KEY ("passage_id") REFERENCES "public"."passages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "costs" ADD CONSTRAINT "costs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_ops" ADD CONSTRAINT "memory_ops_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_provenance" ADD CONSTRAINT "message_provenance_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_provenance" ADD CONSTRAINT "message_provenance_passage_id_passages_id_fk" FOREIGN KEY ("passage_id") REFERENCES "public"."passages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passages" ADD CONSTRAINT "passages_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "summaries" ADD CONSTRAINT "summaries_passage_id_passages_id_fk" FOREIGN KEY ("passage_id") REFERENCES "public"."passages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "working_memory_items" ADD CONSTRAINT "working_memory_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;