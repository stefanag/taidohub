import * as React from 'react';

import { type FeatureFlagCode } from './flags.js';
import { FeatureFlagsContext } from './provider.js';

/** Read one flag by its typed code. Returns `false` for any flag the provider does not know. */
export function useFeatureFlag(code: FeatureFlagCode): boolean {
  const flags = React.useContext(FeatureFlagsContext);
  return flags[code] ?? false;
}
