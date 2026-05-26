import * as React from 'react';

import { type FeatureFlagCode } from './flags.js';
import { useFeatureFlag } from './useFeatureFlag.js';

export interface FeatureFlagProps {
  code: FeatureFlagCode;
  children: React.ReactNode;
  /** Rendered when the flag is off. Defaults to `null`. */
  fallback?: React.ReactNode;
}

/** Wraps children in a runtime check against the named flag. */
export function FeatureFlag({ code, children, fallback = null }: FeatureFlagProps): React.ReactNode {
  return useFeatureFlag(code) ? children : fallback;
}
