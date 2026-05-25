import { integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { beltRanks } from './belt-ranks.js';

/**
 * Honorary titles overlaid on Dan ranks. `code` is the natural primary key
 * (referenced by `rank_history.shogo_title` and `user_profile.shogo_title`).
 * `sort_order` ranks the titles for the "highest verified shogo" recompute.
 */
export const shogoTitles = pgTable('shogo_titles', {
  code: text('code').primaryKey(),
  nameEn: text('name_en').notNull(),
  nameSv: text('name_sv').notNull(),
  nameFi: text('name_fi').notNull(),
  nameJa: text('name_ja').notNull(),
  minRankId: uuid('min_rank_id')
    .notNull()
    .references(() => beltRanks.id, { onDelete: 'restrict' }),
  sortOrder: integer('sort_order').notNull().default(0),
});

export type DbShogoTitle = typeof shogoTitles.$inferSelect;
export type DbNewShogoTitle = typeof shogoTitles.$inferInsert;
