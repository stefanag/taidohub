import { useSuspenseQuery } from '@tanstack/react-query';
import { FeatureFlagMapSchema } from '@repo/contracts/feature-flags';
import * as React from 'react';

import { httpClient } from '@/shared/api';

import { DEFAULT_FLAGS, type FeatureFlagMap } from './flags.js';

/**
 * Context that exposes the resolved `FeatureFlagMap`. Defaults to the all-off
 * map so a missing provider doesn't blow up the tree — every call to
 * `useFeatureFlag` returns `false` in that case, matching the "flag off"
 * semantics.
 */
export const FeatureFlagsContext = React.createContext<FeatureFlagMap>(DEFAULT_FLAGS);

export interface FeatureFlagsProviderProps {
  children: React.ReactNode;
  /**
   * Optional override — primarily for tests / Storybook to inject a specific
   * map without hitting the API. Production callers omit this and the
   * provider fetches from `GET /api/feature-flags`.
   */
  flags?: FeatureFlagMap;
}

/**
 * Production path: suspends at app boot while the SPA fetches the resolved
 * flag map from `GET /api/feature-flags`. The Suspense boundary lives at the
 * router root.
 *
 * Test / Storybook path: pass `flags={{...}}` to skip the fetch entirely and
 * inject a known map synchronously.
 */
export function FeatureFlagsProvider({
  children,
  flags,
}: FeatureFlagsProviderProps): React.ReactElement {
  if (flags) {
    return <FeatureFlagsContext.Provider value={flags}>{children}</FeatureFlagsContext.Provider>;
  }
  return <FetchingProvider>{children}</FetchingProvider>;
}

function FetchingProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  // queryKey must match `featureFlagsKeys.all` from the entity hooks so the
  // sysadmin toggle mutation's `invalidateQueries(['feature-flags'])` triggers
  // a refetch of the public map exposed to the SPA.
  const { data } = useSuspenseQuery({
    queryKey: ['feature-flags'],
    queryFn: async () => {
      const raw = await httpClient('/api/feature-flags');
      return FeatureFlagMapSchema.parse(raw);
    },
    staleTime: Infinity,
  });
  return <FeatureFlagsContext.Provider value={data}>{children}</FeatureFlagsContext.Provider>;
}
