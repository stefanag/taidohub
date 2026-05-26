/**
 * The frontend-side feature-flag registry. Flag codes are a closed string
 * union so a typo at a `useFeatureFlag('xxx')` call site is a type error,
 * not a silently-always-false flag. v1 is env-driven only — the
 * `VITE_FEATURE_FLAGS` JSON object set at build time becomes the single
 * source of truth for the lifetime of the SPA session. A server-side flag
 * service can slot in later (followup D5 backend half) by replacing the
 * provider's source without changing the hook surface.
 */

export const FEATURE_FLAG_CODES = [
  'grading-history',
  'grading-history-verification',
  'instructor-feedback',
] as const;

export type FeatureFlagCode = (typeof FEATURE_FLAG_CODES)[number];

export type FeatureFlagMap = Readonly<Record<FeatureFlagCode, boolean>>;

/** Default-off map. Every known flag resolves to `false` unless overridden. */
export const DEFAULT_FLAGS: FeatureFlagMap = Object.freeze(
  Object.fromEntries(FEATURE_FLAG_CODES.map((code) => [code, false])) as Record<
    FeatureFlagCode,
    boolean
  >,
);

/**
 * Parse the `VITE_FEATURE_FLAGS` JSON string into a `FeatureFlagMap`.
 *
 * - Missing / empty / `'{}'` → returns `DEFAULT_FLAGS` unchanged.
 * - Unknown keys in the JSON are dropped silently (forward-compat with new
 *   codes appearing in env before the code that consumes them ships).
 * - Non-boolean values are coerced to `false` (defensive — env injection
 *   shouldn't be able to flip a flag on with a truthy-but-not-`true` value).
 * - Parse errors fall back to `DEFAULT_FLAGS` and log a warning; the SPA
 *   keeps booting.
 */
export function parseFlagsFromEnv(raw: string | undefined): FeatureFlagMap {
  if (!raw || raw.trim() === '' || raw.trim() === '{}') return DEFAULT_FLAGS;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[feature-flags] Failed to parse VITE_FEATURE_FLAGS:', err);
    return DEFAULT_FLAGS;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return DEFAULT_FLAGS;
  }
  const next: Record<FeatureFlagCode, boolean> = { ...DEFAULT_FLAGS };
  for (const code of FEATURE_FLAG_CODES) {
    const value = (parsed as Record<string, unknown>)[code];
    next[code] = value === true;
  }
  return Object.freeze(next);
}
