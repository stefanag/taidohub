CREATE TABLE "user_content_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"content_type" text NOT NULL,
	"technique_id" uuid,
	"pattern_id" uuid,
	"status" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"last_practiced_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_content_progress" ADD CONSTRAINT "user_content_progress_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_content_progress" ADD CONSTRAINT "user_content_progress_technique_id_technique_id_fk" FOREIGN KEY ("technique_id") REFERENCES "public"."technique"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_content_progress" ADD CONSTRAINT "user_content_progress_pattern_id_pattern_id_fk" FOREIGN KEY ("pattern_id") REFERENCES "public"."pattern"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_content_progress_user_idx" ON "user_content_progress" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_content_progress_user_technique_uniq" ON "user_content_progress" USING btree ("user_id","technique_id") WHERE "user_content_progress"."technique_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "user_content_progress_user_pattern_uniq" ON "user_content_progress" USING btree ("user_id","pattern_id") WHERE "user_content_progress"."pattern_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "user_content_progress" ADD CONSTRAINT "user_content_progress_polymorphic_check" CHECK (
  ("content_type" = 'technique' AND "technique_id" IS NOT NULL AND "pattern_id" IS NULL)
  OR ("content_type" = 'pattern' AND "pattern_id" IS NOT NULL AND "technique_id" IS NULL)
);--> statement-breakpoint
ALTER TABLE "user_content_progress" ADD CONSTRAINT "user_content_progress_status_check" CHECK (
  "status" IN ('not_started', 'learning', 'competent', 'grading_ready')
);