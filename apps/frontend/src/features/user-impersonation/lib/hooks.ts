import { useMutation, useQueryClient } from '@tanstack/react-query';

import * as api from '../api/impersonation.api.js';

export function useStartImpersonating() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.startImpersonating,
    onSuccess: () => {
      // The impersonated user has different visibility — invalidate everything
      // so cached queries refetch under the new session.
      void qc.invalidateQueries();
    },
  });
}

export function useStopImpersonating() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.stopImpersonating,
    onSuccess: () => {
      void qc.invalidateQueries();
    },
  });
}
