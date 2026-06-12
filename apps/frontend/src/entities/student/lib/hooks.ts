import type { UpsertInstructorProgressInput } from '@repo/contracts/progress';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from '../api/student.api.js';

/**
 * React Query hooks for the Students module.
 *
 * Query keys are namespaced under `['student', ...]` so a single
 * `invalidateQueries({ queryKey: ['student'] })` after any mutation refetches
 * the roster + every per-student progress list in one shot.
 *
 * Each mutation also invalidates `['progress']` so a student viewing their
 * own progress sees instructor updates the next time their queries refetch.
 */
export const studentKeys = {
  all: ['student'] as const,
  list: ['student', 'list'] as const,
  progress: (userId: string) => ['student', 'progress', userId] as const,
};

export function useStudentsQuery() {
  return useQuery({
    queryKey: studentKeys.list,
    queryFn: () => api.getStudents(),
  });
}

export function useStudentProgressQuery(userId: string | null) {
  return useQuery({
    queryKey: userId
      ? studentKeys.progress(userId)
      : (['student', 'progress', '_disabled'] as const),
    queryFn: () => api.getStudentProgress(userId!),
    enabled: !!userId,
  });
}

export function useUpsertStudentTechniqueProgressMutation(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      techniqueId,
      input,
    }: {
      techniqueId: string;
      input: UpsertInstructorProgressInput;
    }) => api.upsertStudentTechniqueProgress(userId, techniqueId, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: studentKeys.all });
      void qc.invalidateQueries({ queryKey: ['progress'] });
    },
  });
}

export function useUpsertStudentPatternProgressMutation(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      patternId,
      input,
    }: {
      patternId: string;
      input: UpsertInstructorProgressInput;
    }) => api.upsertStudentPatternProgress(userId, patternId, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: studentKeys.all });
      void qc.invalidateQueries({ queryKey: ['progress'] });
    },
  });
}

export function useDeleteStudentTechniqueProgressMutation(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (techniqueId: string) =>
      api.deleteStudentTechniqueProgress(userId, techniqueId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: studentKeys.all });
      void qc.invalidateQueries({ queryKey: ['progress'] });
    },
  });
}

export function useDeleteStudentPatternProgressMutation(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patternId: string) =>
      api.deleteStudentPatternProgress(userId, patternId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: studentKeys.all });
      void qc.invalidateQueries({ queryKey: ['progress'] });
    },
  });
}
