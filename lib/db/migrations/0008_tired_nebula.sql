ALTER TABLE "card_passages" ADD COLUMN "evidence_role" text DEFAULT 'supporting' NOT NULL;--> statement-breakpoint
ALTER TABLE "concept_cards" ADD COLUMN "generation_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "concept_cards" ADD COLUMN "source_fingerprint" text DEFAULT '' NOT NULL;