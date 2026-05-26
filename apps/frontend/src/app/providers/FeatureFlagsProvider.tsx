import * as React from 'react';

import { FeatureFlagsProvider as Provider } from '@/shared/lib/feature-flags';

/**
 * App-level wrapper around `FeatureFlagsProvider` from `shared/lib`. Lives in
 * `app/providers/` alongside `AuthProvider` / `QueryProvider` so the boot
 * order is obvious; the underlying provider is a re-export to make it easy
 * for tests / Storybook to inject an explicit `flags` prop.
 */
export function FeatureFlagsProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return <Provider>{children}</Provider>;
}
