import { sql } from 'drizzle-orm';
import {
  AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { beltSystems } from './belt-systems.js';
import { organisations } from './organisations.js';

/**
 * A specific rank inside a system (5th Kyu, 3rd Dan). `level` ascends within
 * the system (1 = lowest). `next_rank_id` is an explicit override for the
 * ladder; the service rejects self-references. `slug` is required at the DB
 * level when `publicly_visible = true` (CHECK constraint) and is globally
 * unique among non-null values (partial unique index).
 */
export const beltRanks = pgTable(
  'belt_ranks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organisationId: uuid('organisation_id').references(() => organisations.id, {
      onDelete: 'cascade',
    }),
    systemId: uuid('system_id')
      .notNull()
      .references(() => beltSystems.id, { onDelete: 'restrict' }),
    level: integer('level').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    nameJa: text('name_ja'),
    nameRomaji: text('name_romaji').notNull(),
    nameEn: text('name_en').notNull().default(''),
    nameSv: text('name_sv').notNull().default(''),
    nameFi: text('name_fi').notNull().default(''),
    beltColor: text('belt_color').notNull(),
    /**
     * Per-rank visual spec consumed by `<BeltGraphic>`. Shape matches
     * `BeltVisualsSchema` in @repo/contracts/ranks: {gradient, badge?, stripe?,
     * midLine?, midLineGradient?, overlayTopHalf?}. JSON instead of dedicated
     * columns so an org can author new visual styles without a schema change.
     */
    visuals: jsonb('visuals')
      .notNull()
      .default(sql`'{"gradient":"white"}'::jsonb`),
    imageUrl: text('image_url'),
    descriptionEn: text('description_en'),
    descriptionSv: text('description_sv'),
    descriptionFi: text('description_fi'),
    publiclyVisible: boolean('publicly_visible').notNull().default(false),
    slug: text('slug'),
    minAge: integer('min_age'),
    nextRankId: uuid('next_rank_id').references((): AnyPgColumn => beltRanks.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orgSystemLevelUnique: uniqueIndex('belt_ranks_organisation_system_level_unique').on(
      table.organisationId,
      table.systemId,
      table.level,
    ),
    systemIdx: index('belt_ranks_system_id_idx').on(table.systemId),
    orgIdx: index('belt_ranks_organisation_id_idx').on(table.organisationId),
    // Partial unique on (organisation_id, slug) — only enforced where slug is
    // set. The migration SQL adds NULLS NOT DISTINCT so two global ranks with
    // the same slug still collide (drizzle's uniqueIndex builder cannot
    // express NULLS NOT DISTINCT yet, so the snapshot misses it but the DB
    // constraint is correct).
    slugUnique: uniqueIndex('belt_ranks_organisation_slug_unique')
      .on(table.organisationId, table.slug)
      .where(sql`${table.slug} IS NOT NULL`),
    slugRequiredWhenPublic: check(
      'belt_ranks_slug_required_when_public',
      sql`NOT ${table.publiclyVisible} OR (${table.slug} IS NOT NULL AND ${table.slug} <> '')`,
    ),
  }),
);

export type DbBeltRank = typeof beltRanks.$inferSelect;
export type DbNewBeltRank = typeof beltRanks.$inferInsert;
