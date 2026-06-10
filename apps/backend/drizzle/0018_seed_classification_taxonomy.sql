-- pgcrypto for gen_random_uuid(). No-op if already installed (postgres 13+ has it as a built-in by default).
CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint

-- Roots
INSERT INTO "classification_category" ("id", "parent_id", "code", "name_en", "name_sv", "name_fi", "name_ja", "sort_order", "is_active")
VALUES
  (gen_random_uuid(), NULL, 'technique_type', 'Technique type', 'Tekniktyp',     'Tekniikkatyyppi',  '', 1, true),
  (gen_random_uuid(), NULL, 'sotai_category', 'Sotai category', 'Sotai-kategori', 'Sotai-kategoria',  '', 2, true),
  (gen_random_uuid(), NULL, 'attack_type',    'Attack type',    'Attacktyp',      'Hyökkäystyyppi',   '', 3, true);
--> statement-breakpoint

-- technique_type children
INSERT INTO "classification_category" ("id", "parent_id", "code", "name_en", "name_sv", "name_fi", "name_ja", "sort_order", "is_active")
SELECT gen_random_uuid(), r."id", v.code, v.name_en, v.name_sv, v.name_fi, '', v.so, true
FROM "classification_category" r
CROSS JOIN (VALUES
  ('taidotechnique',   'Taido technique',   'Taidoteknik',       'Taidotekniikka',     0),
  ('generaltechnique', 'General technique', 'Allmän teknik',     'Yleinen tekniikka',  1),
  ('unsoku',           'Unsoku',            'Unsoku',            'Unsoku',             2),
  ('kamae',            'Kamae',             'Kamae',             'Kamae',              3),
  ('unshin',           'Unshin',            'Unshin',            'Unshin',             4),
  ('tachi',            'Tachi',             'Tachi',             'Tachi',              5)
) AS v(code, name_en, name_sv, name_fi, so)
WHERE r."code" = 'technique_type' AND r."parent_id" IS NULL;
--> statement-breakpoint

-- sotai_category children
INSERT INTO "classification_category" ("id", "parent_id", "code", "name_en", "name_sv", "name_fi", "name_ja", "sort_order", "is_active")
SELECT gen_random_uuid(), r."id", v.code, v.name_en, v.name_sv, v.name_fi, '', v.so, true
FROM "classification_category" r
CROSS JOIN (VALUES
  ('sentai', 'Sentai', 'Sentai', 'Sentai', 0),
  ('untai',  'Untai',  'Untai',  'Untai',  1),
  ('hentai', 'Hentai', 'Hentai', 'Hentai', 2),
  ('nentai', 'Nentai', 'Nentai', 'Nentai', 3),
  ('tentai', 'Tentai', 'Tentai', 'Tentai', 4)
) AS v(code, name_en, name_sv, name_fi, so)
WHERE r."code" = 'sotai_category' AND r."parent_id" IS NULL;
--> statement-breakpoint

-- attack_type children
INSERT INTO "classification_category" ("id", "parent_id", "code", "name_en", "name_sv", "name_fi", "name_ja", "sort_order", "is_active")
SELECT gen_random_uuid(), r."id", v.code, v.name_en, v.name_sv, v.name_fi, '', v.so, true
FROM "classification_category" r
CROSS JOIN (VALUES
  ('kick',          'Kick',          'Spark',          'Potku',         0),
  ('punch',         'Punch',         'Slag',           'Lyönti',        1),
  ('block',         'Block',         'Blockering',     'Torjunta',      2),
  ('takedown',      'Takedown',      'Nedtagning',     'Alasvienti',    3),
  ('off_balancing', 'Off-balancing', 'Obalansering',   'Tasapainotus',  4),
  ('grabbing',      'Grabbing',      'Grepp',          'Tarttuminen',   5),
  ('dodge',         'Dodge',         'Undanmanöver',   'Väistö',        6)
) AS v(code, name_en, name_sv, name_fi, so)
WHERE r."code" = 'attack_type' AND r."parent_id" IS NULL;
