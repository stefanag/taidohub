CREATE TABLE "pattern" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by_organisation_id" uuid,
	"created_by_user_id" text,
	"official_body_org_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"min_rank_id" uuid,
	"name_ja" text DEFAULT '' NOT NULL,
	"name_romaji" text NOT NULL,
	"name_sv" text DEFAULT '' NOT NULL,
	"name_en" text DEFAULT '' NOT NULL,
	"name_fi" text DEFAULT '' NOT NULL,
	"description_sv" text DEFAULT '' NOT NULL,
	"description_en" text DEFAULT '' NOT NULL,
	"description_fi" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pattern_classification" (
	"pattern_id" uuid NOT NULL,
	"classification_category_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pattern_classification_pattern_id_classification_category_id_pk" PRIMARY KEY("pattern_id","classification_category_id")
);
--> statement-breakpoint
ALTER TABLE "pattern" ADD CONSTRAINT "pattern_created_by_organisation_id_organisations_id_fk" FOREIGN KEY ("created_by_organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pattern" ADD CONSTRAINT "pattern_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pattern" ADD CONSTRAINT "pattern_official_body_org_id_organisations_id_fk" FOREIGN KEY ("official_body_org_id") REFERENCES "public"."organisations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pattern" ADD CONSTRAINT "pattern_min_rank_id_belt_ranks_id_fk" FOREIGN KEY ("min_rank_id") REFERENCES "public"."belt_ranks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pattern_classification" ADD CONSTRAINT "pattern_classification_pattern_id_pattern_id_fk" FOREIGN KEY ("pattern_id") REFERENCES "public"."pattern"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pattern_classification" ADD CONSTRAINT "pattern_classification_classification_category_id_classification_category_id_fk" FOREIGN KEY ("classification_category_id") REFERENCES "public"."classification_category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pattern_classification_category_idx" ON "pattern_classification" USING btree ("classification_category_id");