/**
 * Frontend-side feature-flag types/registry. The single source of truth lives
 * in `@repo/contracts/feature-flags` and is shared with the backend. This file
 * is a thin re-export so existing call sites importing from
 * `@/shared/lib/feature-flags` keep working unchanged.
 *
 * The previous `parseFlagsFromEnv` helper has been removed: env (Vite-inlined
 * `VITE_FEATURE_FLAGS`) is no longer the source of truth. The provider now
 * fetches the resolved map from `GET /api/feature-flags` at app boot under a
 * Suspense boundary.
 */

export {
  FEATURE_FLAG_CODES,
  DEFAULT_FLAGS,
  type FeatureFlagCode,
  type FeatureFlagMap,
} from '@repo/contracts/feature-flags';
