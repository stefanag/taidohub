CREATE TABLE "rank_grading_requirement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rank_id" uuid NOT NULL,
	"set_id" uuid,
	"jissen_minutes" integer,
	"jissen_tested" boolean DEFAULT false NOT NULL,
	"min_months_since_previous_rank" integer,
	"requires_theoric_exam" boolean DEFAULT false NOT NULL,
	"requires_essay" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rank_requirement_hokei_group" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rank_id" uuid NOT NULL,
	"set_id" uuid,
	"group_order" integer DEFAULT 0 NOT NULL,
	"pick_count" integer DEFAULT 1 NOT NULL,
	"is_tested" boolean DEFAULT false NOT NULL,
	"label_en" text,
	"label_fi" text,
	"label_sv" text
);
--> statement-breakpoint
CREATE TABLE "rank_requirement_hokei_group_pattern" (
	"group_id" uuid NOT NULL,
	"pattern_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rank_requirement_hokei_group_pattern_group_id_pattern_id_pk" PRIMARY KEY("group_id","pattern_id")
);
--> statement-breakpoint
CREATE TABLE "rank_requirement_pattern" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rank_id" uuid NOT NULL,
	"set_id" uuid,
	"pattern_id" uuid NOT NULL,
	"is_tested" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rank_requirement_technique" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rank_id" uuid NOT NULL,
	"set_id" uuid,
	"technique_id" uuid NOT NULL,
	"is_tested" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requirement_set" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"organisation_id" uuid,
	"effective_date" date NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"cloned_from_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rank_grading_requirement" ADD CONSTRAINT "rank_grading_requirement_rank_id_belt_ranks_id_fk" FOREIGN KEY ("rank_id") REFERENCES "public"."belt_ranks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_grading_requirement" ADD CONSTRAINT "rank_grading_requirement_set_id_requirement_set_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."requirement_set"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_requirement_hokei_group" ADD CONSTRAINT "rank_requirement_hokei_group_rank_id_belt_ranks_id_fk" FOREIGN KEY ("rank_id") REFERENCES "public"."belt_ranks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_requirement_hokei_group" ADD CONSTRAINT "rank_requirement_hokei_group_set_id_requirement_set_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."requirement_set"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_requirement_hokei_group_pattern" ADD CONSTRAINT "rank_requirement_hokei_group_pattern_group_id_rank_requirement_hokei_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."rank_requirement_hokei_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_requirement_hokei_group_pattern" ADD CONSTRAINT "rank_requirement_hokei_group_pattern_pattern_id_pattern_id_fk" FOREIGN KEY ("pattern_id") REFERENCES "public"."pattern"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_requirement_pattern" ADD CONSTRAINT "rank_requirement_pattern_rank_id_belt_ranks_id_fk" FOREIGN KEY ("rank_id") REFERENCES "public"."belt_ranks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_requirement_pattern" ADD CONSTRAINT "rank_requirement_pattern_set_id_requirement_set_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."requirement_set"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_requirement_pattern" ADD CONSTRAINT "rank_requirement_pattern_pattern_id_pattern_id_fk" FOREIGN KEY ("pattern_id") REFERENCES "public"."pattern"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_requirement_technique" ADD CONSTRAINT "rank_requirement_technique_rank_id_belt_ranks_id_fk" FOREIGN KEY ("rank_id") REFERENCES "public"."belt_ranks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_requirement_technique" ADD CONSTRAINT "rank_requirement_technique_set_id_requirement_set_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."requirement_set"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_requirement_technique" ADD CONSTRAINT "rank_requirement_technique_technique_id_technique_id_fk" FOREIGN KEY ("technique_id") REFERENCES "public"."technique"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_set" ADD CONSTRAINT "requirement_set_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rank_grading_requirement_by_scope_idx" ON "rank_grading_requirement" USING btree ("rank_id","set_id");--> statement-breakpoint
CREATE INDEX "rank_requirement_hokei_group_by_scope_idx" ON "rank_requirement_hokei_group" USING btree ("rank_id","set_id");--> statement-breakpoint
CREATE INDEX "rank_requirement_pattern_by_scope_idx" ON "rank_requirement_pattern" USING btree ("rank_id","set_id");--> statement-breakpoint
CREATE INDEX "rank_requirement_technique_by_scope_idx" ON "rank_requirement_technique" USING btree ("rank_id","set_id");--> statement-breakpoint
CREATE INDEX "requirement_set_by_org_idx" ON "requirement_set" USING btree ("organisation_id");