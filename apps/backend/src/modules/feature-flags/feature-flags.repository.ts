import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { FeatureFlagCode } from '@repo/contracts/feature-flags';

import { DRIZZLE, type DrizzleDb } from '../../infrastructure/database/client.js';
import { featureFlag } from '../../infrastructure/database/schema/feature-flag.js';

export type FeatureFlagRow = typeof featureFlag.$inferSelect;

/**
 * Repository — the only file in the feature-flags module allowed to touch
 * Drizzle. Single-table CRUD over `feature_flag`.
 */
@Injectable()
export class FeatureFlagsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async list(): Promise<FeatureFlagRow[]> {
    return this.db.select().from(featureFlag);
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
  ): Promise<FeatureFlagRow> {
    const [row] = await this.db
      .update(featureFlag)
      .set({ enabled, updatedAt: new Date(), updatedById: updatedByUserId })
      .where(eq(featureFlag.code, code))
      .returning();
    if (!row) throw new Error(`Feature flag row vanished mid-update: ${code}`);
    return row;
  }
}
