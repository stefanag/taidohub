import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { user } from './users';

/**
 * `posts` — application-owned table. `authorId` references the better-auth
 * `user` table; deleting a user cascades their posts.
 */
export const posts = pgTable(
  'posts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    authorId: text('author_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    content: text('content').notNull(),
    published: boolean('published').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    authorIdx: index('posts_author_id_idx').on(table.authorId),
    publishedIdx: index('posts_published_idx').on(table.published),
  }),
);

export type DbPost = typeof posts.$inferSelect;
export type DbNewPost = typeof posts.$inferInsert;
