import { Inject, Injectable } from '@nestjs/common';
import { type CreatePostInput, type UpdatePostInput } from '@repo/contracts/posts';
import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm';

import {
  DRIZZLE,
  type DrizzleDb,
} from '../../infrastructure/database/client';
import { posts, type DbPost } from '../../infrastructure/database/schema';

export interface ListFilter {
  page: number;
  perPage: number;
  published?: boolean;
  q?: string;
}

@Injectable()
export class PostsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async findById(id: string): Promise<DbPost | null> {
    const rows = await this.db.select().from(posts).where(eq(posts.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async list(filter: ListFilter): Promise<{ data: DbPost[]; total: number }> {
    const filters: SQL[] = [];
    if (filter.published !== undefined) {
      filters.push(eq(posts.published, filter.published));
    }
    if (filter.q) {
      const needle = `%${filter.q}%`;
      const search = or(ilike(posts.title, needle), ilike(posts.content, needle));
      if (search) filters.push(search);
    }
    const where = filters.length ? and(...filters) : undefined;

    const offset = (filter.page - 1) * filter.perPage;
    const data = await this.db
      .select()
      .from(posts)
      .where(where)
      .orderBy(desc(posts.createdAt))
      .limit(filter.perPage)
      .offset(offset);

    const totalRows = await this.db.select({ value: count() }).from(posts).where(where);
    const total = Number(totalRows[0]?.value ?? 0);

    return { data, total };
  }

  async create(authorId: string, input: CreatePostInput): Promise<DbPost> {
    const rows = await this.db
      .insert(posts)
      .values({
        authorId,
        title: input.title,
        content: input.content,
        published: input.published ?? false,
      })
      .returning();
    if (!rows[0]) {
      throw new Error('Insert returned no rows.');
    }
    return rows[0];
  }

  async update(id: string, input: UpdatePostInput): Promise<DbPost | null> {
    const rows = await this.db
      .update(posts)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.content !== undefined ? { content: input.content } : {}),
        ...(input.published !== undefined ? { published: input.published } : {}),
        updatedAt: new Date(),
      })
      .where(eq(posts.id, id))
      .returning();
    return rows[0] ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.db.delete(posts).where(eq(posts.id, id)).returning({ id: posts.id });
    return rows.length > 0;
  }
}
