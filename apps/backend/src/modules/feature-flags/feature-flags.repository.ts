import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { FeatureFlagCode } from '@repo/contracts/feature-flags';

import { DRIZZLE, type DrizzleDb, type DrizzleExecutor } from '../../infrastructure/database/client.js';
import { featureFlag } from '../../infrastructure/database/schema/feature-flag.js';
import { user } from '../../infrastructure/database/schema/users.js';

export type FeatureFlagRow = typeof featureFlag.$inferSelect;

export interface FeatureFlagRowWithUpdater extends FeatureFlagRow {
  updatedBy: { id: string; name: string | null; email: string } | null;
}

/**
 * Repository — the only file in the feature-flags module allowed to touch
 * Drizzle. Single-table CRUD over `feature_flag`.
 *
 * Mutating calls accept an optional `DrizzleExecutor` so the service can
 * wrap the write together with the audit-log `insert` in a single transaction.
 * Read calls intentionally remain off the root db handle — they're always
 * idempotent and don't need to participate in a tx.
 */
@Injectable()
export class FeatureFlagsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async list(): Promise<FeatureFlagRow[]> {
    return this.db.select().from(featureFlag);
  }

  /**
   * Same as `list()` but LEFT JOINs `user` so the caller doesn't have to
   * chase the `updated_by_id` FK for display purposes. The join is left so
   * a row whose updater no longer exists (FK is `ON DELETE SET NULL`) still
   * comes back — it just has `updatedBy: null`.
   *
   * Only the admin surface needs this shape; the guard + resolveMap paths
   * stay on the leaner `list()`.
   */
  async listWithUpdater(): Promise<FeatureFlagRowWithUpdater[]> {
    const rows = await this.db
      .select({
        flag: featureFlag,
        updater: { id: user.id, name: user.name, email: user.email },
      })
      .from(featureFlag)
      .leftJoin(user, eq(user.id, featureFlag.updatedById));
    return rows.map((r) => ({
      ...r.flag,
      updatedBy: r.updater?.id ? r.updater : null,
    }));
  }

  async findByCode(code: FeatureFlagCode): Promise<FeatureFlagRow | undefined> {
    const rows = await this.db
      .select()
      .from(featureFlag)
      .where(eq(featureFlag.code, code))
      .limit(1);
    return rows[0];
  }

  async updateEnabled(
    code: FeatureFlagCode,
    enabled: boolean,
    updatedByUserId: string,
    executor: DrizzleExecutor = this.db,
  ): Promise<FeatureFlagRow> {
    const [row] = await executor
      .update(featureFlag)
      .set({ enabled, updatedAt: new Date(), updatedById: updatedByUserId })
      .where(eq(featureFlag.code, code))
      .returning();
    if (!row) throw new Error(`Feature flag row vanished mid-update: ${code}`);
    return row;
  }
}
