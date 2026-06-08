import type {
  FeatureFlagCode,
  UpdateFeatureFlagInput,
} from '@repo/contracts/feature-flags';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from '../api/feature-flags.api.js';

/**
 * React Query hooks for the Feature Flags module.
 *
 * Note: there is intentionally no `useFeatureFlagsQuery()` for the public map.
 * The SPA-level feature-flag provider (Task 9) owns that query directly so
 * every component can read flags synchronously via context. Feature-tier
 * components should not refetch the public map.
 */
export const featureFlagsKeys = {
  all: ['feature-flags'] as const,
  admin: ['feature-flags', 'admin'] as const,
};

export function useAdminFeatureFlagsQuery() {
  return useQuery({
    queryKey: featureFlagsKeys.admin,
    queryFn: api.getAdminFeatureFlags,
  });
}

export function useUpdateFeatureFlagMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      code,
      input,
    }: {
      code: FeatureFlagCode;
      input: UpdateFeatureFlagInput;
    }) => api.updateFeatureFlag(code, input),
    onSuccess: () => {
      // Invalidate both the admin row list and the public-map query that the
      // SPA provider uses, so a toggle propagates everywhere immediately.
      void qc.invalidateQueries({ queryKey: featureFlagsKeys.admin });
      void qc.invalidateQueries({ queryKey: featureFlagsKeys.all });
    },
  });
}
