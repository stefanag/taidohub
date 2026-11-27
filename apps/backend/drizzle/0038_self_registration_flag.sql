-- Register the self-registration feature flag (off). See the note in
-- 0014_majestic_nightcrawler.sql: a new flag code gets its own migration.
INSERT INTO "feature_flag" ("code") VALUES ('self-registration') ON CONFLICT DO NOTHING;
