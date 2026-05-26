import * as React from 'react';

import { DEFAULT_FLAGS, parseFlagsFromEnv, type FeatureFlagMap } from './flags.js';

/**
 * Context that exposes the parsed `FeatureFlagMap`. Defaults to the all-off
 * map so a missing provider doesn't blow up the tree — every call to
 * `useFeatureFlag` returns `false` in that case, matching the "flag off"
 * semantics.
 */
export const FeatureFlagsContext = React.createContext<FeatureFlagMap>(DEFAULT_FLAGS);

export interface FeatureFlagsProviderProps {
  children: React.ReactNode;
  /**
   * Optional override — primarily for tests / Storybook to inject a specific
   * map without touching `import.meta.env`. Production callers omit this and
   * the provider reads `VITE_FEATURE_FLAGS` itself.
   */
  flags?: FeatureFlagMap;
}

/**
 * Reads `VITE_FEATURE_FLAGS` at mount and freezes the result for the lifetime
 * of the SPA. Vite inlines env at build time, so this is a one-shot parse —
 * no resubscribe / no re-render churn.
 */
export function FeatureFlagsProvider({
  children,
  flags,
}: FeatureFlagsProviderProps): React.ReactElement {
  const value = React.useMemo<FeatureFlagMap>(
    () => flags ?? parseFlagsFromEnv(import.meta.env.VITE_FEATURE_FLAGS as string | undefined),
    [flags],
  );
  return <FeatureFlagsContext.Provider value={value}>{children}</FeatureFlagsContext.Provider>;
}
