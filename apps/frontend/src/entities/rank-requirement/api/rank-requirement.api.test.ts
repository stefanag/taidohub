import type { SetGradingRequirementsInput } from '@repo/contracts';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/api', async (orig) => {
  const actual = await orig<typeof import('@/shared/api')>();
  return { ...actual, httpClient: vi.fn() };
});

import { httpClient } from '@/shared/api';

import {
  clearRequirements,
  getRequirements,
  getRequirementsForSet,
  getRequirementsForUser,
  setRequirements,
} from './rank-requirement.api.js';

const RANK_ID = '550e8400-e29b-41d4-a716-446655440000';
const SET_ID = '550e8400-e29b-41d4-a716-446655440001';
const USER_ID = '550e8400-e29b-41d4-a716-446655440002';

const STUB_GRADING_REQUIREMENTS = {
  rankId: RANK_ID,
  setId: SET_ID,
  hokeiGroups: [],
  kobo: [],
  koboTested: [],
  otherPatterns: [],
  otherPatternsTested: [],
  kihon: [],
  kihonTested: [],
  jissenMinutes: null,
  jissenTested: false,
  minMonthsSincePreviousRank: null,
  requiresTheoricExam: false,
  requiresEssay: false,
};

const mockedHttp = vi.mocked(httpClient);

describe('rank-requirement api', () => {
  it('getRequirements(rankId) GETs /api/requirements/:rankId', async () => {
    mockedHttp.mockResolvedValueOnce(STUB_GRADING_REQUIREMENTS);
    const out = await getRequirements(RANK_ID);
    expect(mockedHttp).toHaveBeenCalledWith(`/api/requirements/${RANK_ID}`);
    expect(out.rankId).toBe(RANK_ID);
  });

  it('getRequirementsForUser(rankId, userId) GETs /api/requirements/:rankId?forUserId=', async () => {
    mockedHttp.mockResolvedValueOnce(STUB_GRADING_REQUIREMENTS);
    const out = await getRequirementsForUser(RANK_ID, USER_ID);
    expect(mockedHttp).toHaveBeenCalledWith(
      `/api/requirements/${RANK_ID}?forUserId=${encodeURIComponent(USER_ID)}`,
    );
    expect(out.rankId).toBe(RANK_ID);
  });

  it('getRequirementsForSet(rankId, setId) GETs /api/requirements/:rankId?setId=', async () => {
    mockedHttp.mockResolvedValueOnce(STUB_GRADING_REQUIREMENTS);
    const out = await getRequirementsForSet(RANK_ID, SET_ID);
    expect(mockedHttp).toHaveBeenCalledWith(`/api/requirements/${RANK_ID}?setId=${encodeURIComponent(SET_ID)}`);
    expect(out.setId).toBe(SET_ID);
  });

  it('setRequirements(rankId, body) PUTs /api/requirements/:rankId with the body', async () => {
    mockedHttp.mockResolvedValueOnce(STUB_GRADING_REQUIREMENTS);
    const body: SetGradingRequirementsInput = {
      setId: SET_ID,
      hokeiGroups: [],
      kobo: [],
      koboTested: [],
      otherPatterns: [],
      otherPatternsTested: [],
      kihon: [],
      kihonTested: [],
      jissenMinutes: null,
      jissenTested: false,
      minMonthsSincePreviousRank: null,
      requiresTheoricExam: false,
      requiresEssay: false,
    };
    const out = await setRequirements(RANK_ID, body);
    expect(mockedHttp).toHaveBeenCalledWith(`/api/requirements/${RANK_ID}`, {
      method: 'PUT',
      body,
    });
    expect(out.rankId).toBe(RANK_ID);
  });

  it('clearRequirements(rankId, setId) DELETEs /api/requirements/:rankId?setId=', async () => {
    mockedHttp.mockResolvedValueOnce(undefined);
    await clearRequirements(RANK_ID, SET_ID);
    expect(mockedHttp).toHaveBeenCalledWith(`/api/requirements/${RANK_ID}?setId=${encodeURIComponent(SET_ID)}`, {
      method: 'DELETE',
    });
  });
});
