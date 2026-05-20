import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, ilike, isNotNull, isNull, or, type SQL } from 'drizzle-orm';

import {
  DRIZZLE,
  type DrizzleDb,
  type DrizzleExecutor,
} from '../../infrastructure/database/client.js';
import { user, type DbUser } from '../../infrastructure/database/schema/index.js';

export interface ListUsersFilter {
  q?: string;
  role?: string;
  deactivated: 'true' | 'false' | 'all';
  page: number;
  perPage: number;
}

/**
 * Repository — the only file in the users module allowed to touch Drizzle.
 * Services consume its async methods; cross-module callers must go through
 * `UsersService`.
 */
@Injectable()
export class UsersRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async findById(id: string): Promise<DbUser | null> {
    const rows = await this.db.select().from(user).where(eq(user.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async findByEmail(email: string): Promise<DbUser | null> {
    const rows = await this.db.select().from(user).where(eq(user.email, email)).limit(1);
    return rows[0] ?? null;
  }

  async list(filter: ListUsersFilter): Promise<{ rows: DbUser[]; total: number }> {
    const filters: SQL[] = [];
    if (filter.q) {
      const needle = `%${filter.q}%`;
      const search = or(ilike(user.email, needle), ilike(user.name, needle));
      if (search) filters.push(search);
    }
    if (filter.role) filters.push(eq(user.role, filter.role));
    if (filter.deactivated === 'false') filters.push(isNull(user.deactivatedAt));
    else if (filter.deactivated === 'true') filters.push(isNotNull(user.deactivatedAt));
    const where = filters.length ? and(...filters) : undefined;

    const offset = (filter.page - 1) * filter.perPage;
    const rows = await this.db
      .select()
      .from(user)
      .where(where)
      .orderBy(user.email)
      .limit(filter.perPage)
      .offset(offset);
    const totalRows = await this.db.select({ value: count() }).from(user).where(where);
    return { rows, total: Number(totalRows[0]?.value ?? 0) };
  }

  async update(
    id: string,
    patch: { name?: string; role?: string },
    tx?: DrizzleExecutor,
  ): Promise<DbUser | null> {
    const conn = tx ?? this.db;
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.name !== undefined) set.name = patch.name;
    if (patch.role !== undefined) set.role = patch.role;
    const rows = await conn.update(user).set(set).where(eq(user.id, id)).returning();
    return rows[0] ?? null;
  }

  /** Count users whose role is `sysadmin` and who are not deactivated. */
  async countActiveSysadmins(): Promise<number> {
    const rows = await this.db
      .select({ value: count() })
      .from(user)
      .where(and(eq(user.role, 'sysadmin'), isNull(user.deactivatedAt)));
    return Number(rows[0]?.value ?? 0);
  }
}
