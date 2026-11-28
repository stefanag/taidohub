CREATE TABLE "rank_requirement_age_group" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rank_id" uuid NOT NULL,
	"set_id" uuid,
	"age_from" integer,
	"age_to" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rank_requirement_age_group_has_bound" CHECK ("rank_requirement_age_group"."age_from" IS NOT NULL OR "rank_requirement_age_group"."age_to" IS NOT NULL),
	CONSTRAINT "rank_requirement_age_group_ordered" CHECK ("rank_requirement_age_group"."age_from" IS NULL OR "rank_requirement_age_group"."age_to" IS NULL OR "rank_requirement_age_group"."age_from" <= "rank_requirement_age_group"."age_to")
);
--> statement-breakpoint
DROP INDEX "rank_grading_requirement_by_scope_idx";--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "grading_age_basis" text;--> statement-breakpoint
ALTER TABLE "rank_history" ADD COLUMN "judged_set_id" uuid;--> statement-breakpoint
ALTER TABLE "rank_history" ADD COLUMN "judged_set_name" text;--> statement-breakpoint
ALTER TABLE "rank_history" ADD COLUMN "judged_age_group_id" uuid;--> statement-breakpoint
ALTER TABLE "rank_history" ADD COLUMN "judged_age_from" integer;--> statement-breakpoint
ALTER TABLE "rank_history" ADD COLUMN "judged_age_to" integer;--> statement-breakpoint
ALTER TABLE "rank_history" ADD COLUMN "judged_age_basis" text;--> statement-breakpoint
ALTER TABLE "rank_grading_requirement" ADD COLUMN "age_group_id" uuid;--> statement-breakpoint
ALTER TABLE "rank_requirement_hokei_group" ADD COLUMN "age_group_id" uuid;--> statement-breakpoint
ALTER TABLE "rank_requirement_pattern" ADD COLUMN "age_group_id" uuid;--> statement-breakpoint
ALTER TABLE "rank_requirement_technique" ADD COLUMN "age_group_id" uuid;--> statement-breakpoint
ALTER TABLE "rank_requirement_age_group" ADD CONSTRAINT "rank_requirement_age_group_rank_id_belt_ranks_id_fk" FOREIGN KEY ("rank_id") REFERENCES "public"."belt_ranks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_requirement_age_group" ADD CONSTRAINT "rank_requirement_age_group_set_id_requirement_set_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."requirement_set"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rank_requirement_age_group_by_scope_idx" ON "rank_requirement_age_group" USING btree ("rank_id","set_id");--> statement-breakpoint
ALTER TABLE "rank_history" ADD CONSTRAINT "rank_history_judged_set_id_requirement_set_id_fk" FOREIGN KEY ("judged_set_id") REFERENCES "public"."requirement_set"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_history" ADD CONSTRAINT "rank_history_judged_age_group_id_rank_requirement_age_group_id_fk" FOREIGN KEY ("judged_age_group_id") REFERENCES "public"."rank_requirement_age_group"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_grading_requirement" ADD CONSTRAINT "rank_grading_requirement_age_group_id_rank_requirement_age_group_id_fk" FOREIGN KEY ("age_group_id") REFERENCES "public"."rank_requirement_age_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_requirement_hokei_group" ADD CONSTRAINT "rank_requirement_hokei_group_age_group_id_rank_requirement_age_group_id_fk" FOREIGN KEY ("age_group_id") REFERENCES "public"."rank_requirement_age_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_requirement_pattern" ADD CONSTRAINT "rank_requirement_pattern_age_group_id_rank_requirement_age_group_id_fk" FOREIGN KEY ("age_group_id") REFERENCES "public"."rank_requirement_age_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_requirement_technique" ADD CONSTRAINT "rank_requirement_technique_age_group_id_rank_requirement_age_group_id_fk" FOREIGN KEY ("age_group_id") REFERENCES "public"."rank_requirement_age_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_grading_requirement" ADD CONSTRAINT "rank_grading_requirement_by_scope" UNIQUE NULLS NOT DISTINCT("rank_id","set_id","age_group_id");