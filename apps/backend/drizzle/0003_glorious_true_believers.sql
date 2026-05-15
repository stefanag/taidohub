CREATE TABLE "organisations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"type" text NOT NULL,
	"short_code" text NOT NULL,
	"slug" text,
	"country" text NOT NULL,
	"name_en" text NOT NULL,
	"name_sv" text NOT NULL,
	"name_fi" text NOT NULL,
	"name_ja" text,
	"logo_url" text,
	"address" text,
	"contact_email" text,
	"head_instructor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organisations" ADD CONSTRAINT "organisations_parent_id_organisations_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."organisations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organisations" ADD CONSTRAINT "organisations_head_instructor_id_user_id_fk" FOREIGN KEY ("head_instructor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "organisations_parent_id_idx" ON "organisations" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "organisations_type_idx" ON "organisations" USING btree ("type");--> statement-breakpoint
CREATE INDEX "organisations_country_idx" ON "organisations" USING btree ("country");--> statement-breakpoint
CREATE UNIQUE INDEX "organisations_slug_unique" ON "organisations" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "organisations_short_code_country_type_unique" ON "organisations" USING btree ("country","type","short_code");