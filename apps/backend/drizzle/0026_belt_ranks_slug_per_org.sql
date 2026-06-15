DROP INDEX "belt_ranks_slug_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "belt_ranks_organisation_slug_unique"
  ON "belt_ranks" ("organisation_id", "slug")
  NULLS NOT DISTINCT
  WHERE "slug" IS NOT NULL;
