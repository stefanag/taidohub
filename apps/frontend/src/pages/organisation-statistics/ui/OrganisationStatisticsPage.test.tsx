import { STAT_METRICS } from '@repo/contracts/statistics';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OrganisationStatisticsPage } from './OrganisationStatisticsPage.js';

import type { Organisation } from '@repo/contracts/organisations';
import type { OrganisationStats, StatsTrendResponse } from '@repo/contracts/statistics';

import { HttpError } from '@/shared/api';

function makeOrg(overrides: Partial<Organisation> & { id: string }): Organisation {
  return {
    parentId: null,
    type: 'club',
    shortCode: 'X',
    slug: null,
    country: 'USA',
    nameEn: 'Org',
    nameSv: 'Org',
    nameFi: 'Org',
    nameJa: null,
    logoUrl: null,
    address: null,
    contactEmail: null,
    headInstructorId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const CURRENT_ORG = makeOrg({ id: 'org-1', parentId: 'root-1', nameEn: 'Current Club' });
const ROOT_ORG = makeOrg({
  id: 'root-1',
  parentId: null,
  nameEn: 'World Federation',
  type: 'international_federation',
  country: null,
});
const CHILD_ORG = makeOrg({ id: 'child-1', parentId: 'org-1', nameEn: 'Child Club' });

const ORG_STATS: OrganisationStats = {
  scope: { type: 'organisation', id: 'org-1', name: 'Current Club' },
  metrics: {
    membershipCount: { student: 40, instructor: 6, orgadmin: 2 },
    gradingEventsMonthToDate: 12,
    activeUsersLast30Days: 30,
    feedbackThreadsOpenedMonthToDate: 3,
  },
  ranks: [{ rank: { id: 'r1', nameRomaji: 'Shodan', nameEn: '1st Dan', sortOrder: 10 }, count: 4 }],
  updatedAt: '2026-07-01T00:00:00.000Z',
};

const TRENDS: StatsTrendResponse = {
  metric: 'membershipCount',
  dimensionKey: 'student',
  points: [
    { year: 2026, month: 6, value: 30 },
    { year: 2026, month: 7, value: 40 },
  ],
};

interface OrgQueryState {
  data: Organisation | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
}

// Stateful mocks, reset in `beforeEach`. `orgs` is keyed by id so the
// recursive ancestor-breadcrumb component (each level calls
// `useOrganisationQuery` with a different id) resolves independently from
// the main org lookup.
const { state } = vi.hoisted(() => ({
  state: {
    orgs: {} as Record<string, OrgQueryState>,
    stats: {
      data: undefined as OrganisationStats | undefined,
      isLoading: true,
      isError: false,
      error: null as unknown,
    },
    trends: {
      data: undefined as StatsTrendResponse | undefined,
      isLoading: true,
    },
    children: {
      data: undefined as { data: Organisation[]; total: number } | undefined,
      isLoading: false,
    },
  },
}));

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ id: 'org-1' }),
}));

// Mock the public `@/entities/organisation` / `@/entities/statistics`
// barrels (not the deep api/lib paths) so the FSD `no-public-api-sidestep`
// rule stays satisfied — mirrors `AdminStatisticsPage.test.tsx`.
vi.mock('@/entities/organisation', () => ({
  displayName: (org: { nameEn: string }) => org.nameEn,
  useOrganisationQuery: (id: string) =>
    state.orgs[id] ?? { data: undefined, isLoading: true, isError: false, error: null },
  useOrganisationChildrenQuery: () => state.children,
}));

const { useOrganisationTrendsQueryMock } = vi.hoisted(() => ({
  useOrganisationTrendsQueryMock: vi.fn(),
}));

vi.mock('@/entities/statistics', () => ({
  useOrganisationStatsQuery: () => state.stats,
  useOrganisationTrendsQuery: (...args: unknown[]) => {
    useOrganisationTrendsQueryMock(...args);
    return state.trends;
  },
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OrganisationStatisticsPage />
    </QueryClientProvider>,
  );
}

describe('<OrganisationStatisticsPage>', () => {
  beforeEach(() => {
    state.orgs = {
      'org-1': { data: CURRENT_ORG, isLoading: false, isError: false, error: null },
    };
    state.stats = { data: ORG_STATS, isLoading: false, isError: false, error: null };
    state.trends = { data: TRENDS, isLoading: false };
    state.children = { data: { data: [], total: 0 }, isLoading: false };
    useOrganisationTrendsQueryMock.mockClear();
  });

  it('renders the loading state while org and stats queries are loading', () => {
    state.orgs = {
      'org-1': { data: undefined, isLoading: true, isError: false, error: null },
    };
    state.stats = { data: undefined, isLoading: true, isError: false, error: null };
    renderPage();

    expect(screen.getAllByText(/loading/i).length).toBeGreaterThan(0);
  });

  it('renders 4 tiles with the correct labels and values once data resolves', () => {
    renderPage();

    expect(screen.getByText('Students')).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();
    expect(screen.getByText('Instructors')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText('Active users (30d)')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByText('Gradings this month')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('renders the rank breakdown', () => {
    renderPage();

    expect(screen.getByText('Belts in this organisation')).toBeInTheDocument();
    const items = screen.getAllByRole('listitem');
    expect(items.some((item) => item.textContent?.includes('Shodan'))).toBe(true);
    expect(items.some((item) => item.textContent?.includes('4'))).toBe(true);
  });

  it('renders the trend sparkline with the resolved trend points', () => {
    const { container } = renderPage();

    expect(screen.getByText('Students, last 12 months')).toBeInTheDocument();
    const polyline = container.querySelector('polyline');
    expect(polyline).not.toBeNull();
    const pairs = polyline?.getAttribute('points')?.trim().split(/\s+/) ?? [];
    expect(pairs).toHaveLength(TRENDS.points.length);
  });

  it('queries the trend hook with the snake_case wire metric name, not the camelCase contract field', () => {
    renderPage();

    expect(useOrganisationTrendsQueryMock).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ metric: STAT_METRICS.membershipCount }),
    );
    expect(STAT_METRICS.membershipCount).toBe('membership_count');
  });

  it('renders the ancestor breadcrumb when a parent chain exists', () => {
    state.orgs = {
      'org-1': { data: CURRENT_ORG, isLoading: false, isError: false, error: null },
      'root-1': { data: ROOT_ORG, isLoading: false, isError: false, error: null },
    };
    renderPage();

    const ancestorLink = screen.getByRole('link', { name: 'World Federation' });
    expect(ancestorLink).toHaveAttribute('href', '/organisation/root-1/statistics');
    expect(screen.getByRole('heading', { name: 'Current Club' })).toBeInTheDocument();
  });

  it('handles a parentId cycle without infinite loop', () => {
    // org-1's parent is root-1, and root-1's parent points back to org-1 —
    // a corrupted cycle that the cycle guard in AncestorCrumbs must stop.
    const orgWithCycleParent = makeOrg({ id: 'org-1', parentId: 'root-1', nameEn: 'Current Club' });
    const rootWithCycleParent = makeOrg({
      id: 'root-1',
      parentId: 'org-1',
      nameEn: 'World Federation',
      type: 'international_federation',
      country: null,
    });
    state.orgs = {
      'org-1': { data: orgWithCycleParent, isLoading: false, isError: false, error: null },
      'root-1': { data: rootWithCycleParent, isLoading: false, isError: false, error: null },
    };

    renderPage();

    const nav = screen.getByRole('navigation', { name: 'Ancestors' });
    // Only ancestor *links* are in scope here — the org's own name also
    // appears once more as the non-link current-org label at the end of the
    // breadcrumb, which is expected and not part of what the cycle guard
    // governs.
    expect(within(nav).getAllByRole('link', { name: 'World Federation' })).toHaveLength(1);
    expect(within(nav).queryAllByRole('link', { name: 'Current Club' })).toHaveLength(1);
  });

  it('renders direct child-org links for drill-down', () => {
    state.children = { data: { data: [CHILD_ORG], total: 1 }, isLoading: false };
    renderPage();

    const childLink = screen.getByRole('link', { name: 'Child Club' });
    expect(childLink).toHaveAttribute('href', '/organisation/child-1/statistics');
  });

  it('renders an access-denied message when the stats query is forbidden', () => {
    state.stats = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: new HttpError(403, {
        code: 'FORBIDDEN',
        message: 'You do not have access to this organisation.',
      }),
    };
    renderPage();

    expect(
      screen.getByText("You don't have access to this organisation's statistics."),
    ).toBeInTheDocument();
  });
});
