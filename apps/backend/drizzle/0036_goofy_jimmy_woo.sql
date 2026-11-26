CREATE TABLE "legal_document_translation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"revision" integer NOT NULL,
	"title" text NOT NULL,
	"body" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" text
);
--> statement-breakpoint
CREATE TABLE "legal_document_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"authoritative_locale" text NOT NULL,
	"requires_reacceptance" boolean DEFAULT false NOT NULL,
	"change_summary" text,
	"published_at" timestamp with time zone,
	"published_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" text
);
--> statement-breakpoint
CREATE TABLE "legal_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"organisation_id" uuid,
	"audience" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" text,
	CONSTRAINT "legal_document_owner_kind_audience_unique" UNIQUE NULLS NOT DISTINCT("kind","organisation_id","audience")
);
--> statement-breakpoint
CREATE TABLE "user_document_acknowledgement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"version_id" uuid NOT NULL,
	"type" text NOT NULL,
	"displayed_locale" text NOT NULL,
	"displayed_translation_revision" integer NOT NULL,
	"displayed_content_hash" text NOT NULL,
	"authoritative_locale" text NOT NULL,
	"authoritative_content_hash" text NOT NULL,
	"context" text NOT NULL,
	"organisation_id" uuid,
	"acknowledged_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "legal_document_translation" ADD CONSTRAINT "legal_document_translation_version_id_legal_document_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."legal_document_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_document_translation" ADD CONSTRAINT "legal_document_translation_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_document_version" ADD CONSTRAINT "legal_document_version_document_id_legal_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."legal_document"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_document_version" ADD CONSTRAINT "legal_document_version_published_by_user_id_user_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_document_version" ADD CONSTRAINT "legal_document_version_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_document" ADD CONSTRAINT "legal_document_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_document" ADD CONSTRAINT "legal_document_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_document_acknowledgement" ADD CONSTRAINT "user_document_acknowledgement_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_document_acknowledgement" ADD CONSTRAINT "user_document_acknowledgement_version_id_legal_document_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."legal_document_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_document_acknowledgement" ADD CONSTRAINT "user_document_acknowledgement_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "legal_document_translation_version_locale_revision_unique" ON "legal_document_translation" USING btree ("version_id","locale","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "legal_document_version_document_version_unique" ON "legal_document_version" USING btree ("document_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "legal_document_version_one_draft" ON "legal_document_version" USING btree ("document_id") WHERE "legal_document_version"."status" = 'draft';--> statement-breakpoint
CREATE UNIQUE INDEX "legal_document_version_one_published" ON "legal_document_version" USING btree ("document_id") WHERE "legal_document_version"."status" = 'published';--> statement-breakpoint
CREATE INDEX "legal_document_organisation_id_idx" ON "legal_document" USING btree ("organisation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_document_acknowledgement_user_version_unique" ON "user_document_acknowledgement" USING btree ("user_id","version_id");