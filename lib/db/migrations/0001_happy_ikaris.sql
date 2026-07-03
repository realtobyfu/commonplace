ALTER TABLE "works" ADD COLUMN "source_file" text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "passages_work_ordinal_idx" ON "passages" USING btree ("work_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "works_pack_title_idx" ON "works" USING btree ("pack_id","author","title");