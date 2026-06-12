import {
  ProgressSchema,
  type Progress,
  type UpsertInstructorProgressInput,
} from '@repo/contracts/progress';
import {
  StudentRosterRowSchema,
  type StudentRosterRow,
} from '@repo/contracts/students';
import { z } from 'zod';

import { httpClient } from '@/shared/api';

/**
 * Network surface for the Students module — instructor view of the roster and
 * the per-student progress lists.
 *
 * Responses are parsed with the Zod schemas from `@repo/contracts/*` so the
 * frontend cannot drift away from the backend's actual response shape.
 *
 * - `GET    /api/students`                                       — instructor's visible roster.
 * - `GET    /api/students/:userId/progress`                      — full progress list for a student.
 * - `PUT    /api/students/:userId/progress/techniques/:id`       — upsert technique progress on behalf of a student.
 * - `PUT    /api/students/:userId/progress/patterns/:id`         — upsert pattern progress on behalf of a student.
 * - `DELETE /api/students/:userId/progress/techniques/:id`       — delete row.
 * - `DELETE /api/students/:userId/progress/patterns/:id`         — delete row.
 */

const RosterSchema = z.array(StudentRosterRowSchema);
const ProgressListSchema = z.array(ProgressSchema);

export async function getStudents(): Promise<StudentRosterRow[]> {
  const raw = await httpClient('/api/students');
  return RosterSchema.parse(raw);
}

export async function getStudentProgress(
  userId: string,
): Promise<Progress[]> {
  const raw = await httpClient(`/api/students/${userId}/progress`);
  return ProgressListSchema.parse(raw);
}

export async function upsertStudentTechniqueProgress(
  userId: string,
  techniqueId: string,
  input: UpsertInstructorProgressInput,
): Promise<Progress> {
  const raw = await httpClient(
    `/api/students/${userId}/progress/techniques/${techniqueId}`,
    { method: 'PUT', body: input },
  );
  return ProgressSchema.parse(raw);
}

export async function upsertStudentPatternProgress(
  userId: string,
  patternId: string,
  input: UpsertInstructorProgressInput,
): Promise<Progress> {
  const raw = await httpClient(
    `/api/students/${userId}/progress/patterns/${patternId}`,
    { method: 'PUT', body: input },
  );
  return ProgressSchema.parse(raw);
}

export async function deleteStudentTechniqueProgress(
  userId: string,
  techniqueId: string,
): Promise<void> {
  await httpClient(
    `/api/students/${userId}/progress/techniques/${techniqueId}`,
    { method: 'DELETE' },
  );
}

export async function deleteStudentPatternProgress(
  userId: string,
  patternId: string,
): Promise<void> {
  await httpClient(
    `/api/students/${userId}/progress/patterns/${patternId}`,
    { method: 'DELETE' },
  );
}
