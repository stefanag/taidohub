-- Register the club-join-requests and self-test feature flags (off). See
-- the note in 0014_majestic_nightcrawler.sql: new flag codes get a migration.
INSERT INTO "feature_flag" ("code") VALUES ('club-join-requests'), ('self-test') ON CONFLICT DO NOTHING;
