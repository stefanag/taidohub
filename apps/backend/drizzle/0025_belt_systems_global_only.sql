UPDATE "belt_ranks" r
SET "system_id" = g.id
FROM "belt_systems" s
JOIN "belt_systems" g ON g."organisation_id" IS NULL AND g."code" = s."code"
WHERE r."system_id" = s.id AND s."organisation_id" IS NOT NULL;
--> statement-breakpoint
DELETE FROM "belt_systems" WHERE "organisation_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "belt_systems" DROP CONSTRAINT "belt_systems_organisation_id_organisations_id_fk";
--> statement-breakpoint
DROP INDEX "belt_systems_organisation_id_idx";
--> statement-breakpoint
DROP INDEX "belt_systems_organisation_id_code_unique";
--> statement-breakpoint
ALTER TABLE "belt_systems" DROP COLUMN "organisation_id";
--> statement-breakpoint
CREATE UNIQUE INDEX "belt_systems_code_unique" ON "belt_systems" USING btree ("code");
