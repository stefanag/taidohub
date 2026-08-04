import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

import type {
  OrganisationStats,
  PlatformStats,
  RebuildStatsResponse,
  StatsTrendResponse,
  UserStats,
} from '@repo/contracts/statistics';

import * as api from '../api/statistics.api.js';

import {
  statisticsKeys,
  useOrganisationStatsQuery,
  useOrganisationTrendsQuery,
  usePlatformStatsQuery,
  useRebuildStatsMutation,
  useUserStatsQuery,
  useUserTrendsQuery,
} from './hooks.js';

/**
 * Pattern 1 from `docs/frontend-test-recipe.md`: `renderHook` +
 * `QueryClientProvider` wrapper + `vi.spyOn` on the intra-slice fetcher +
 * assertions on the call args / on `invalidateQueries`.
 */

function wrap(client: QueryClient) {
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
  Wrapper.displayName = 'QueryWrapper';
  return Wrapper;
}

function newClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

const ORG_ID = 'org-1';
const USER_ID = 'user-1';

describe('statisticsKeys', () => {
  it('pins the coarse root', () => {
    expect(statisticsKeys.all).toEqual(['statistics']);
  });

  it('nests the platform key under the root', () => {
    expect(statisticsKeys.platform()).toEqual(['statistics', 'platform']);
  });

  it('nests the organisation key under the root', () => {
    expect(statisticsKeys.organisation(ORG_ID)).toEqual(['statistics', 'organisation', ORG_ID]);
  });

  it('nests the organisation-trends key under the root, including the query', () => {
    const q = { metric: 'gradingEvents', dimensionKey: '', months: 12 };
    expect(statisticsKeys.organisationTrends(ORG_ID, q)).toEqual([
      'statistics',
      'organisation',
      ORG_ID,
      'trends',
      q,
    ]);
  });

  it('nests the user key under the root', () => {
    expect(statisticsKeys.user(USER_ID)).toEqual(['statistics', 'user', USER_ID]);
  });

  it('nests the user-trends key under the root, including the query', () => {
    const q = { metric: 'gradingEvents', dimensionKey: '', months: 12 };
    expect(statisticsKeys.userTrends(USER_ID, q)).toEqual([
      'statistics',
      'user',
      USER_ID,
      'trends',
      q,
    ]);
  });
});

describe('usePlatformStatsQuery', () => {
  it('calls getPlatformStats', async () => {
    const spy = vi
      .spyOn(api, 'getPlatformStats')
      .mockResolvedValue({ scope: { type: 'platform' } } as PlatformStats);
    const client = newClient();

    const { result } = renderHook(() => usePlatformStatsQuery(), { wrapper: wrap(client) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(spy).toHaveBeenCalledWith();
  });
});

describe('useOrganisationStatsQuery', () => {
  it('calls getOrganisationStats with the orgId', async () => {
    const spy = vi
      .spyOn(api, 'getOrganisationStats')
      .mockResolvedValue({ scope: { type: 'organisation', id: ORG_ID } } as OrganisationStats);
    const client = newClient();

    const { result } = renderHook(() => useOrganisationStatsQuery(ORG_ID), {
      wrapper: wrap(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(spy).toHaveBeenCalledWith(ORG_ID);
  });
});

describe('useOrganisationTrendsQuery', () => {
  it('calls getOrganisationTrends with the orgId and query', async () => {
    const q = { metric: 'gradingEvents', dimensionKey: '', months: 12 };
    const spy = vi
      .spyOn(api, 'getOrganisationTrends')
      .mockResolvedValue({ metric: 'gradingEvents', dimensionKey: '', points: [] } as StatsTrendResponse);
    const client = newClient();

    const { result } = renderHook(() => useOrganisationTrendsQuery(ORG_ID, q), {
      wrapper: wrap(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(spy).toHaveBeenCalledWith(ORG_ID, q);
  });
});

describe('useUserStatsQuery', () => {
  it('calls getUserStats with the userId', async () => {
    const spy = vi
      .spyOn(api, 'getUserStats')
      .mockResolvedValue({ scope: { type: 'user', id: USER_ID, name: null } } as UserStats);
    const client = newClient();

    const { result } = renderHook(() => useUserStatsQuery(USER_ID), { wrapper: wrap(client) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(spy).toHaveBeenCalledWith(USER_ID);
  });
});

describe('useUserTrendsQuery', () => {
  it('calls getUserTrends with the userId and query', async () => {
    const q = { metric: 'gradingEvents', dimensionKey: '', months: 12 };
    const spy = vi
      .spyOn(api, 'getUserTrends')
      .mockResolvedValue({ metric: 'gradingEvents', dimensionKey: '', points: [] } as StatsTrendResponse);
    const client = newClient();

    const { result } = renderHook(() => useUserTrendsQuery(USER_ID, q), {
      wrapper: wrap(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(spy).toHaveBeenCalledWith(USER_ID, q);
  });

  it('does not call getUserTrends when enabled: false is passed', async () => {
    const q = { metric: 'gradingEvents', dimensionKey: '', months: 12 };
    const spy = vi
      .spyOn(api, 'getUserTrends')
      .mockResolvedValue({ metric: 'gradingEvents', dimensionKey: '', points: [] } as StatsTrendResponse);
    // `vi.spyOn` on an already-spied method (from the earlier test in this
    // describe block) returns the same mock instance, so its call history
    // carries over; clear it so this assertion only reflects this test.
    spy.mockClear();
    const client = newClient();

    const { result } = renderHook(() => useUserTrendsQuery(USER_ID, q, { enabled: false }), {
      wrapper: wrap(client),
    });

    // Give any (incorrect) fetch a chance to fire before asserting it didn't.
    await Promise.resolve();

    expect(result.current.isPending).toBe(true);
    expect(result.current.data).toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('useRebuildStatsMutation', () => {
  it('invalidates the entire statistics root on success', async () => {
    vi.spyOn(api, 'rebuildStats').mockResolvedValue({
      ok: true,
      durationMs: 10,
    } as RebuildStatsResponse);
    const client = newClient();
    const spy = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useRebuildStatsMutation(), {
      wrapper: wrap(client),
    });

    await act(() => result.current.mutateAsync());

    expect(spy).toHaveBeenCalledWith({ queryKey: statisticsKeys.all });
  });
});
