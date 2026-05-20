CREATE TYPE "public"."membership_role" AS ENUM('orgadmin', 'instructor');--> statement-breakpoint
CREATE TABLE "organisation_membership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"organisation_id" uuid NOT NULL,
	"role" "membership_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "deactivated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organisation_membership" ADD CONSTRAINT "organisation_membership_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organisation_membership" ADD CONSTRAINT "organisation_membership_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organisation_membership_user_org_role_unique" ON "organisation_membership" USING btree ("user_id","organisation_id","role");--> statement-breakpoint
CREATE INDEX "organisation_membership_user_id_idx" ON "organisation_membership" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "organisation_membership_organisation_id_idx" ON "organisation_membership" USING btree ("organisation_id");--> statement-breakpoint
UPDATE "user" SET "role" = 'sysadmin' WHERE "role" = 'admin';--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_role_check" CHECK ("user"."role" IN ('sysadmin', 'user'));