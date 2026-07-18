CREATE TYPE "public"."conversation_turn_status" AS ENUM('pending', 'planning', 'awaiting_approval', 'streaming', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "conversation_turn_events" (
	"turn_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_turn_events_turn_id_sequence_pk" PRIMARY KEY("turn_id","sequence")
);
--> statement-breakpoint
CREATE TABLE "conversation_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_content" text NOT NULL,
	"approve_large_loads" boolean DEFAULT false NOT NULL,
	"status" "conversation_turn_status" DEFAULT 'pending' NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"user_message_id" uuid,
	"assistant_message_id" uuid,
	"next_event_seq" integer DEFAULT 1 NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "conversation_turn_events" ADD CONSTRAINT "conversation_turn_events_turn_id_conversation_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."conversation_turns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_turns" ADD CONSTRAINT "conversation_turns_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_turns" ADD CONSTRAINT "conversation_turns_user_message_id_messages_id_fk" FOREIGN KEY ("user_message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_turns" ADD CONSTRAINT "conversation_turns_assistant_message_id_messages_id_fk" FOREIGN KEY ("assistant_message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_turns_workspace_idempotency_idx" ON "conversation_turns" USING btree ("workspace_id","idempotency_key");