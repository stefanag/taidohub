-- pgcrypto safety check (Phase 1 migration 0018 already ensured this; harmless if already present).
CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint

-- Roots
INSERT INTO "classification_category" ("id", "parent_id", "code", "name_en", "name_sv", "name_fi", "name_ja", "sort_order", "is_active")
VALUES
  (gen_random_uuid(), NULL, 'pattern_type',  'Pattern type',  'Mönstertyp',     'Kuviotyyppi',     '', 4, true),
  (gen_random_uuid(), NULL, 'hokei_subtype', 'Hokei subtype', 'Hokei-undertyp', 'Hokei-alatyyppi', '', 5, true);
--> statement-breakpoint

-- pattern_type children
INSERT INTO "classification_category" ("id", "parent_id", "code", "name_en", "name_sv", "name_fi", "name_ja", "sort_order", "is_active")
SELECT gen_random_uuid(), r."id", v.code, v.name_en, v.name_sv, v.name_fi, '', v.so, true
FROM "classification_category" r
CROSS JOIN (VALUES
  ('hokei',           'Hokei',           'Hokei',           'Hokei',          0),
  ('kobo',            'Kobo',            'Kobo',            'Kobo',           1),
  ('unsoku_pattern',  'Unsoku pattern',  'Unsoku-mönster',  'Unsoku-kuvio',   2),
  ('unshin_pattern',  'Unshin pattern',  'Unshin-mönster',  'Unshin-kuvio',   3),
  ('rengi',           'Rengi',           'Rengi',           'Rengi',          4),
  ('other',           'Other',           'Annat',           'Muu',            5)
) AS v(code, name_en, name_sv, name_fi, so)
WHERE r."code" = 'pattern_type' AND r."parent_id" IS NULL;
--> statement-breakpoint

-- hokei_subtype children
INSERT INTO "classification_category" ("id", "parent_id", "code", "name_en", "name_sv", "name_fi", "name_ja", "sort_order", "is_active")
SELECT gen_random_uuid(), r."id", v.code, v.name_en, v.name_sv, v.name_fi, '', v.so, true
FROM "classification_category" r
CROSS JOIN (VALUES
  ('yo',    'Yo (陽)',  'Yo (陽)',  'Yo (陽)',  0),
  ('in',    'In (陰)',  'In (陰)',  'In (陰)',  1),
  ('sei',   'Sei (制)', 'Sei (制)', 'Sei (制)', 2),
  ('mei',   'Mei (命)', 'Mei (命)', 'Mei (命)', 3),
  ('gen',   'Gen (玄)', 'Gen (玄)', 'Gen (玄)', 4),
  ('other', 'Other',    'Annat',    'Muu',      5)
) AS v(code, name_en, name_sv, name_fi, so)
WHERE r."code" = 'hokei_subtype' AND r."parent_id" IS NULL;
