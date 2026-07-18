CREATE TABLE "message_context_passages" (
	"message_id" uuid NOT NULL,
	"passage_id" uuid NOT NULL,
	CONSTRAINT "message_context_passages_message_id_passage_id_pk" PRIMARY KEY("message_id","passage_id")
);
--> statement-breakpoint
ALTER TABLE "message_context_passages" ADD CONSTRAINT "message_context_passages_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_context_passages" ADD CONSTRAINT "message_context_passages_passage_id_passages_id_fk" FOREIGN KEY ("passage_id") REFERENCES "public"."passages"("id") ON DELETE no action ON UPDATE no action;