-- Register the grading-readiness and training-log feature flags (off). See
-- the note in 0014_majestic_nightcrawler.sql: new flag codes get a migration.
INSERT INTO "feature_flag" ("code") VALUES ('grading-readiness'), ('training-log') ON CONFLICT DO NOTHING;
