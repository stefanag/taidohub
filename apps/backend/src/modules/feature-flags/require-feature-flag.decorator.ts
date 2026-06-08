import { SetMetadata } from '@nestjs/common';

import type { FeatureFlagCode } from '@repo/contracts/feature-flags';

export const FEATURE_FLAG_KEY = 'feature-flag';

/**
 * Marks a route handler as gated by a feature flag. When the flag is off,
 * `FeatureFlagGuard` throws `NotFoundException` (404) — same response as a
 * route that doesn't exist, deliberately not 403, to avoid leaking roadmap.
 */
export const RequireFeatureFlag = (code: FeatureFlagCode) => SetMetadata(FEATURE_FLAG_KEY, code);
