import type { UpsertInstructorProgressInput } from '@repo/contracts/progress';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/api', async (orig) => {
  const actual = await orig<typeof import('@/shared/api')>();
  return { ...actual, httpClient: vi.fn() };
});

import { httpClient } from '@/shared/api';

import {
  deleteStudentTechniqueProgress,
  getStudentProgress,
  getStudents,
  upsertStudentTechniqueProgress,
} from './student.api.js';

const USER_ID = 'user-abc';
const TECHNIQUE_ID = '550e8400-e29b-41d4-a716-446655440001';

const STUB_PROGRESS = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  userId: USER_ID,
  contentType: 'technique' as const,
  techniqueId: TECHNIQUE_ID,
  patternId: null,
  status: 'learning' as const,
  studentNotes: '',
  instructorNotes: 'good progress',
  lastPracticedAt: null,
  createdAt: '2026-06-11T00:00:00.000Z',
  updatedAt: '2026-06-11T00:00:00.000Z',
};

const mockedHttp = vi.mocked(httpClient);

describe('student api', () => {
  it('getStudents() GETs /api/students', async () => {
    mockedHttp.mockResolvedValueOnce([]);
    await getStudents();
    expect(mockedHttp).toHaveBeenCalledWith('/api/students');
  });

  it('getStudentProgress(userId) GETs /api/students/:userId/progress', async () => {
    mockedHttp.mockResolvedValueOnce([]);
    await getStudentProgress(USER_ID);
    expect(mockedHttp).toHaveBeenCalledWith(
      `/api/students/${USER_ID}/progress`,
    );
  });

  it('upsertStudentTechniqueProgress PUTs body to /api/students/:userId/progress/techniques/:id', async () => {
    mockedHttp.mockResolvedValueOnce(STUB_PROGRESS);
    const input: UpsertInstructorProgressInput = {
      status: 'learning',
      instructorNotes: 'good progress',
      lastPracticedAt: null,
    };
    await upsertStudentTechniqueProgress(USER_ID, TECHNIQUE_ID, input);
    expect(mockedHttp).toHaveBeenCalledWith(
      `/api/students/${USER_ID}/progress/techniques/${TECHNIQUE_ID}`,
      { method: 'PUT', body: input },
    );
  });

  it('deleteStudentTechniqueProgress DELETEs /api/students/:userId/progress/techniques/:id', async () => {
    mockedHttp.mockResolvedValueOnce(undefined);
    await deleteStudentTechniqueProgress(USER_ID, TECHNIQUE_ID);
    expect(mockedHttp).toHaveBeenCalledWith(
      `/api/students/${USER_ID}/progress/techniques/${TECHNIQUE_ID}`,
      { method: 'DELETE' },
    );
  });
});
