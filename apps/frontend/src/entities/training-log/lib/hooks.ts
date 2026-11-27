import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from '../api/training-log.api.js';

import type { ListTrainingSessionsQuery } from '@repo/contracts/training-log';

export const trainingLogKeys = {
  all: ['training-log'] as const,
  sessions: (range: ListTrainingSessionsQuery) => ['training-log', 'sessions', range] as const,
  goal: ['training-log', 'goal'] as const,
};

export function useTrainingSessionsQuery(
  range: ListTrainingSessionsQuery = {},
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: trainingLogKeys.sessions(range),
    queryFn: () => api.listTrainingSessions(range),
    enabled: options?.enabled ?? true,
  });
}

export function useTrainingGoalQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: trainingLogKeys.goal,
    queryFn: api.getTrainingGoal,
    enabled: options?.enabled ?? true,
  });
}

/**
 * Wraps a training-log write. Refreshes the log, and progress too: saving a
 * session moves "last practised" on its items.
 */
export function useTrainingLogMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: trainingLogKeys.all });
      void qc.invalidateQueries({ queryKey: ['progress'] });
    },
  });
}
