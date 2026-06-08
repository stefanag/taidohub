CREATE TABLE "feature_flag" (
	"code" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_id" text
);
--> statement-breakpoint
ALTER TABLE "feature_flag" ADD CONSTRAINT "feature_flag_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
-- Seed: register each currently-known feature flag code with enabled=false.
-- Adding a new code = bump packages/contracts/src/feature-flags.ts, write a
-- new migration that INSERTs the row with ON CONFLICT DO NOTHING.
INSERT INTO "feature_flag" ("code") VALUES
  ('grading-history'),
  ('grading-history-verification'),
  ('instructor-feedback');