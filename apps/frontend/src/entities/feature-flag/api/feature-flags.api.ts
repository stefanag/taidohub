import {
  FeatureFlagMapSchema,
  FeatureFlagSchema,
  type FeatureFlag,
  type FeatureFlagCode,
  type FeatureFlagMap,
  type UpdateFeatureFlagInput,
} from '@repo/contracts/feature-flags';
import { z } from 'zod';

import { httpClient } from '@/shared/api';

/**
 * Network surface for the Feature Flags module.
 *
 * Every response is parsed with the Zod schemas from
 * `@repo/contracts/feature-flags` so the frontend cannot drift away from the
 * backend's actual response shape.
 *
 * - `GET  /api/feature-flags`             — public resolved map (used by the
 *   SPA-level provider; no React Query hook is exposed here).
 * - `GET  /api/admin/feature-flags`       — sysadmin row list.
 * - `PATCH /api/admin/feature-flags/:code` — sysadmin toggle.
 */

const FeatureFlagListSchema = z.array(FeatureFlagSchema);

export async function getFeatureFlags(): Promise<FeatureFlagMap> {
  const raw = await httpClient('/api/feature-flags');
  return FeatureFlagMapSchema.parse(raw);
}

export async function getAdminFeatureFlags(): Promise<FeatureFlag[]> {
  const raw = await httpClient('/api/admin/feature-flags');
  return FeatureFlagListSchema.parse(raw);
}

export async function updateFeatureFlag(
  code: FeatureFlagCode,
  input: UpdateFeatureFlagInput,
): Promise<FeatureFlag> {
  const raw = await httpClient(`/api/admin/feature-flags/${code}`, {
    method: 'PATCH',
    body: input,
  });
  return FeatureFlagSchema.parse(raw);
}
