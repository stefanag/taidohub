CREATE TYPE "public"."rank_history_result" AS ENUM('pass', 'fail');--> statement-breakpoint
CREATE TYPE "public"."rank_history_source" AS ENUM('event', 'external');--> statement-breakpoint
CREATE TABLE "belt_systems" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name_en" text NOT NULL,
	"name_sv" text NOT NULL,
	"name_fi" text NOT NULL,
	"organisation_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "belt_ranks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid,
	"system_id" uuid NOT NULL,
	"level" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"name_ja" text,
	"name_romaji" text NOT NULL,
	"name_en" text DEFAULT '' NOT NULL,
	"name_sv" text DEFAULT '' NOT NULL,
	"name_fi" text DEFAULT '' NOT NULL,
	"belt_color" text NOT NULL,
	"image_url" text,
	"description_en" text,
	"description_sv" text,
	"description_fi" text,
	"publicly_visible" boolean DEFAULT false NOT NULL,
	"slug" text,
	"min_age" integer,
	"next_rank_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "belt_ranks_slug_required_when_public" CHECK (NOT "belt_ranks"."publicly_visible" OR ("belt_ranks"."slug" IS NOT NULL AND "belt_ranks"."slug" <> ''))
);
--> statement-breakpoint
CREATE TABLE "shogo_titles" (
	"code" text PRIMARY KEY NOT NULL,
	"name_en" text NOT NULL,
	"name_sv" text NOT NULL,
	"name_fi" text NOT NULL,
	"name_ja" text NOT NULL,
	"min_rank_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rank_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"rank_id" uuid NOT NULL,
	"shogo_title" text,
	"date" date NOT NULL,
	"result" "rank_history_result" NOT NULL,
	"source" "rank_history_source" NOT NULL,
	"event_id" uuid,
	"recorded_by_user_id" text NOT NULL,
	"examiner_name" text,
	"organisation_name" text,
	"notes" text,
	"verified" boolean DEFAULT false NOT NULL,
	"verified_by_user_id" text,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"updated_by_user_id" text,
	CONSTRAINT "rank_history_source_event_consistency" CHECK (("rank_history"."source" = 'event' AND "rank_history"."event_id" IS NOT NULL)
          OR ("rank_history"."source" = 'external' AND "rank_history"."event_id" IS NULL)),
	CONSTRAINT "rank_history_verified_triple_consistency" CHECK (("rank_history"."verified" = false AND "rank_history"."verified_by_user_id" IS NULL AND "rank_history"."verified_at" IS NULL)
          OR ("rank_history"."verified" = true AND "rank_history"."verified_by_user_id" IS NOT NULL AND "rank_history"."verified_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "shogo_title" text;--> statement-breakpoint
ALTER TABLE "belt_systems" ADD CONSTRAINT "belt_systems_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "belt_ranks" ADD CONSTRAINT "belt_ranks_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "belt_ranks" ADD CONSTRAINT "belt_ranks_system_id_belt_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."belt_systems"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "belt_ranks" ADD CONSTRAINT "belt_ranks_next_rank_id_belt_ranks_id_fk" FOREIGN KEY ("next_rank_id") REFERENCES "public"."belt_ranks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shogo_titles" ADD CONSTRAINT "shogo_titles_min_rank_id_belt_ranks_id_fk" FOREIGN KEY ("min_rank_id") REFERENCES "public"."belt_ranks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_history" ADD CONSTRAINT "rank_history_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_history" ADD CONSTRAINT "rank_history_rank_id_belt_ranks_id_fk" FOREIGN KEY ("rank_id") REFERENCES "public"."belt_ranks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_history" ADD CONSTRAINT "rank_history_shogo_title_shogo_titles_code_fk" FOREIGN KEY ("shogo_title") REFERENCES "public"."shogo_titles"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_history" ADD CONSTRAINT "rank_history_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_history" ADD CONSTRAINT "rank_history_verified_by_user_id_user_id_fk" FOREIGN KEY ("verified_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_history" ADD CONSTRAINT "rank_history_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "belt_systems_organisation_id_code_unique" ON "belt_systems" USING btree ("organisation_id","code");--> statement-breakpoint
CREATE INDEX "belt_systems_organisation_id_idx" ON "belt_systems" USING btree ("organisation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "belt_ranks_organisation_system_level_unique" ON "belt_ranks" USING btree ("organisation_id","system_id","level");--> statement-breakpoint
CREATE INDEX "belt_ranks_system_id_idx" ON "belt_ranks" USING btree ("system_id");--> statement-breakpoint
CREATE INDEX "belt_ranks_organisation_id_idx" ON "belt_ranks" USING btree ("organisation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "belt_ranks_slug_unique" ON "belt_ranks" USING btree ("slug") WHERE "belt_ranks"."slug" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "rank_history_event_id_user_id_unique" ON "rank_history" USING btree ("event_id","user_id") WHERE "rank_history"."event_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "rank_history_user_id_date_idx" ON "rank_history" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "rank_history_rank_id_idx" ON "rank_history" USING btree ("rank_id");--> statement-breakpoint
CREATE INDEX "rank_history_verified_idx" ON "rank_history" USING btree ("verified");--> statement-breakpoint
ALTER TABLE "user_profile" ADD CONSTRAINT "user_profile_shogo_title_shogo_titles_code_fk" FOREIGN KEY ("shogo_title") REFERENCES "public"."shogo_titles"("code") ON DELETE set null ON UPDATE no action;