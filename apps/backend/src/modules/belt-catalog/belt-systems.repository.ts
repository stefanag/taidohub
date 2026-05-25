import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, isNull } from 'drizzle-orm';

import {
  DRIZZLE,
  type DrizzleDb,
  type DrizzleExecutor,
} from '../../infrastructure/database/client.js';
import {
  beltRanks,
  beltSystems,
  type DbBeltSystem,
  type DbNewBeltSystem,
} from '../../infrastructure/database/schema/index.js';

/** Writeable subset of `belt_systems` columns. `id`, `createdAt`, `updatedAt` are managed here. */
export type BeltSystemPatch = Partial<
  Pick<DbBeltSystem, 'code' | 'nameEn' | 'nameSv' | 'nameFi' | 'organisationId' | 'sortOrder'>
>;

@Injectable()
export class BeltSystemsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async findById(id: string, tx?: DrizzleExecutor): Promise<DbBeltSystem | null> {
    const conn = tx ?? this.db;
    const rows = await conn.select().from(beltSystems).where(eq(beltSystems.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async findAll(tx?: DrizzleExecutor): Promise<DbBeltSystem[]> {
    const conn = tx ?? this.db;
    return conn.select().from(beltSystems).orderBy(beltSystems.sortOrder, beltSystems.nameEn);
  }

  /**
   * Look up a system by `(organisation_id, code)`. `organisationId` may be
   * `null` to find a global system; the eq/isNull split keeps the SQL valid.
   */
  async findByCode(
    organisationId: string | null,
    code: string,
    tx?: DrizzleExecutor,
  ): Promise<DbBeltSystem | null> {
    const conn = tx ?? this.db;
    const orgFilter = organisationId === null
      ? isNull(beltSystems.organisationId)
      : eq(beltSystems.organisationId, organisationId);
    const rows = await conn
      .select()
      .from(beltSystems)
      .where(and(orgFilter, eq(beltSystems.code, code)))
      .limit(1);
    return rows[0] ?? null;
  }

  async insert(input: DbNewBeltSystem, tx?: DrizzleExecutor): Promise<DbBeltSystem> {
    const conn = tx ?? this.db;
    const rows = await conn.insert(beltSystems).values(input).returning();
    if (!rows[0]) throw new Error('Insert returned no rows.');
    return rows[0];
  }

  async update(
    id: string,
    patch: BeltSystemPatch,
    tx?: DrizzleExecutor,
  ): Promise<DbBeltSystem | null> {
    const conn = tx ?? this.db;
    const rows = await conn
      .update(beltSystems)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(beltSystems.id, id))
      .returning();
    return rows[0] ?? null;
  }

  async delete(id: string, tx?: DrizzleExecutor): Promise<boolean> {
    const conn = tx ?? this.db;
    const rows = await conn
      .delete(beltSystems)
      .where(eq(beltSystems.id, id))
      .returning({ id: beltSystems.id });
    return rows.length > 0;
  }

  /** Count ranks that reference this system — the system-delete guard. */
  async countRanksUsingSystem(systemId: string, tx?: DrizzleExecutor): Promise<number> {
    const conn = tx ?? this.db;
    const rows = await conn
      .select({ value: count() })
      .from(beltRanks)
      .where(eq(beltRanks.systemId, systemId));
    return Number(rows[0]?.value ?? 0);
  }
}
