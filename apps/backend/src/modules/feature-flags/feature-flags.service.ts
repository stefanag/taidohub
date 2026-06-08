import { Injectable, NotFoundException } from '@nestjs/common';
import {
  DEFAULT_FLAGS,
  FEATURE_FLAG_CODES,
  type FeatureFlagCode,
  type FeatureFlagMap,
} from '@repo/contracts/feature-flags';

import { FeatureFlagsRepository, type FeatureFlagRow } from './feature-flags.repository.js';

/**
 * Business logic for feature flags.
 *
 * Resolution semantics:
 * - Start from {@link DEFAULT_FLAGS} (every known code → `false`).
 * - Overlay any DB row whose code is still in {@link FEATURE_FLAG_CODES}.
 * - Drop DB rows for codes the current build no longer knows about
 *   (forward-compat: a future migration may add codes we don't have yet).
 *
 * Phase A has no in-process cache — every call hits the DB. The spec notes
 * the cache lives in a later phase (§8 of the design doc).
 */
@Injectable()
export class FeatureFlagsService {
  constructor(private readonly repo: FeatureFlagsRepository) {}

  /** Returns the resolved map. Unknown rows in DB are dropped (forward-compat). */
  async resolveMap(): Promise<FeatureFlagMap> {
    const rows = await this.repo.list();
    const map: Record<FeatureFlagCode, boolean> = { ...DEFAULT_FLAGS };
    for (const row of rows) {
      if ((FEATURE_FLAG_CODES as readonly string[]).includes(row.code)) {
        map[row.code as FeatureFlagCode] = row.enabled;
      }
    }
    return map;
  }

  /** Single-flag lookup used by the guard. Missing rows resolve to `false`. */
  async isEnabled(code: FeatureFlagCode): Promise<boolean> {
    const row = await this.repo.findByCode(code);
    return row?.enabled ?? false;
  }

  /** Returns every row (full shape) for the sysadmin admin endpoint. */
  async listRows(): Promise<FeatureFlagRow[]> {
    return this.repo.list();
  }

  /** Sysadmin-only mutation; throws 404 if the code isn't seeded. */
  async setEnabled(
    code: FeatureFlagCode,
    enabled: boolean,
    actingUserId: string,
  ): Promise<FeatureFlagRow> {
    const existing = await this.repo.findByCode(code);
    if (!existing) throw new NotFoundException(`Unknown feature flag: ${code}`);
    return this.repo.updateEnabled(code, enabled, actingUserId);
  }
}
