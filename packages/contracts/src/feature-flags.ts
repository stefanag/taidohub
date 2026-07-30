import { z } from 'zod';

export const FEATURE_FLAG_CODES = [
  'grading-history',
  'grading-history-verification',
  'instructor-feedback',
] as const;

export const FeatureFlagCodeSchema = z.enum(FEATURE_FLAG_CODES);
export type FeatureFlagCode = z.infer<typeof FeatureFlagCodeSchema>;

/** Default-off map. Every known flag resolves to `false` unless overridden. */
export const DEFAULT_FLAGS: Readonly<Record<FeatureFlagCode, boolean>> = Object.freeze(
  Object.fromEntries(FEATURE_FLAG_CODES.map((code) => [code, false])) as Record<
    FeatureFlagCode,
    boolean
  >,
);

/** Wire shape of `GET /api/feature-flags` — the resolved map. */
export const FeatureFlagMapSchema = z
  .object(
    Object.fromEntries(FEATURE_FLAG_CODES.map((code) => [code, z.boolean()])) as Record<
      FeatureFlagCode,
      z.ZodBoolean
    >,
  )
  .meta({ id: 'FeatureFlagMap' });

/**
 * Nested actor shape for the admin row's `updatedBy` — `name` is nullable
 * (users can sign up without one); the UI falls back to `email` in that case.
 */
export const FeatureFlagUpdatedBySchema = z
  .object({
    id: z.string(),
    name: z.string().nullable(),
    email: z.string(),
  })
  .meta({ id: 'FeatureFlagUpdatedBy' });

/** Wire shape of `GET /api/admin/feature-flags` (per-row). */
export const FeatureFlagSchema = z
  .object({
    code: FeatureFlagCodeSchema,
    enabled: z.boolean(),
    updatedAt: z.iso.datetime(),
    updatedBy: FeatureFlagUpdatedBySchema.nullable(),
  })
  .meta({
    id: 'FeatureFlag',
    description: 'A row from the feature_flag table, used by the sysadmin admin endpoint.',
    example: {
      code: 'grading-history',
      enabled: false,
      updatedAt: '2026-06-08T10:00:00.000Z',
      updatedBy: { id: 'u-1', name: 'Ada Lovelace', email: 'ada@example.com' },
    },
  });

export const UpdateFeatureFlagSchema = z
  .object({ enabled: z.boolean() })
  .meta({ id: 'UpdateFeatureFlagInput' });

export type FeatureFlagMap = z.infer<typeof FeatureFlagMapSchema>;
export type FeatureFlag = z.infer<typeof FeatureFlagSchema>;
export type UpdateFeatureFlagInput = z.input<typeof UpdateFeatureFlagSchema>;

/** Registry for OpenAPI generation. */
export const FeatureFlagsOpenApiRegistry = {
  FeatureFlagMap: FeatureFlagMapSchema,
  FeatureFlag: FeatureFlagSchema,
  FeatureFlagUpdatedBy: FeatureFlagUpdatedBySchema,
  UpdateFeatureFlagInput: UpdateFeatureFlagSchema,
} as const;
