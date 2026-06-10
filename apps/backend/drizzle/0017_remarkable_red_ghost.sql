CREATE TABLE "classification_category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"code" text NOT NULL,
	"name_en" text NOT NULL,
	"name_sv" text NOT NULL,
	"name_fi" text NOT NULL,
	"name_ja" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classification_category_parent_code_uniq" UNIQUE NULLS NOT DISTINCT("parent_id","code")
);
--> statement-breakpoint
CREATE TABLE "technique" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by_organisation_id" uuid,
	"created_by_user_id" text,
	"is_kihon" boolean DEFAULT false NOT NULL,
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
CREATE TABLE "technique_classification" (
	"technique_id" uuid NOT NULL,
	"classification_category_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "technique_classification_technique_id_classification_category_id_pk" PRIMARY KEY("technique_id","classification_category_id")
);
--> statement-breakpoint
ALTER TABLE "classification_category" ADD CONSTRAINT "classification_category_parent_id_classification_category_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."classification_category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technique" ADD CONSTRAINT "technique_created_by_organisation_id_organisations_id_fk" FOREIGN KEY ("created_by_organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technique" ADD CONSTRAINT "technique_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technique" ADD CONSTRAINT "technique_min_rank_id_belt_ranks_id_fk" FOREIGN KEY ("min_rank_id") REFERENCES "public"."belt_ranks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technique_classification" ADD CONSTRAINT "technique_classification_technique_id_technique_id_fk" FOREIGN KEY ("technique_id") REFERENCES "public"."technique"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technique_classification" ADD CONSTRAINT "technique_classification_classification_category_id_classification_category_id_fk" FOREIGN KEY ("classification_category_id") REFERENCES "public"."classification_category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "technique_classification_category_idx" ON "technique_classification" USING btree ("classification_category_id");--> statement-breakpoint
CREATE OR REPLACE FUNCTION classification_category_depth_check()
RETURNS trigger AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF (SELECT parent_id FROM classification_category WHERE id = NEW.parent_id) IS NOT NULL THEN
      RAISE EXCEPTION 'classification_category hierarchy is limited to one level: parent_id % is not a root', NEW.parent_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER classification_category_depth_check_trg
  BEFORE INSERT OR UPDATE ON classification_category
  FOR EACH ROW EXECUTE FUNCTION classification_category_depth_check();