import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Membership as MeMembership } from '@/entities/me';
import type {
  ListMembershipsResponse,
  OrganisationMembership,
} from '@/entities/membership';
import type {
  ListOrganisationsResponse,
  Organisation,
} from '@/entities/organisation';
import type { OrganisationStats } from '@repo/contracts/statistics';
import { AbilityProvider, type AppAbility } from '@/shared/lib/casl';

import i18n from '@/i18n';

// jsdom missing pointer APIs for Radix Dialog/Sheet/Select/Tabs.
window.HTMLElement.prototype.hasPointerCapture ??= vi.fn(() => false);
window.HTMLElement.prototype.setPointerCapture ??= vi.fn();
window.HTMLElement.prototype.releasePointerCapture ??= vi.fn();
window.HTMLElement.prototype.scrollIntoView ??= vi.fn();

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';
const ACTOR_ID = 'actor-user';

// --- Stub the entities ------------------------------------------------------
// The vi.fn spies deliberately mirror the entity hooks' `use*` naming so the
// test signals which hook is being stubbed. In a real component this would
// violate rules-of-hooks; inside vi.mock closures the calls are just plain
// function invocations, so silence the rule for this file.
/* eslint-disable react-hooks/rules-of-hooks */

const useMyMembershipsSpy =
  vi.fn<() => { data: MeMembership[] | undefined; isPending: boolean }>(
    () => ({ data: [], isPending: false }),
  );

const useOrgsQuerySpy =
  vi.fn<() => { data: ListOrganisationsResponse | undefined }>(
    () => ({ data: { data: [], total: 0 } }),
  );

const useMembersQuerySpy =
  vi.fn<() => { data: ListMembershipsResponse | undefined; isPending: boolean }>(
    () => ({ data: { data: [], total: 0 }, isPending: false }),
  );

const useOrgStatsQuerySpy = vi.fn<
  () => { data: OrganisationStats | undefined; isLoading: boolean; isError: boolean }
>(() => ({ data: undefined, isLoading: true, isError: false }));

// `useQuery` is routed by the queryKey prefix the entity's `*QueryOptions`
// helpers return below.
vi.mock('@tanstack/react-query', async (orig) => {
  const actual = await orig<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQuery: (opts: { queryKey: unknown[] }) => {
      const key = Array.isArray(opts.queryKey) ? opts.queryKey[0] : null;
      if (key === 'memberships') return useMembersQuerySpy();
      return useOrgsQuerySpy();
    },
  };
});

vi.mock('@/entities/me', () => ({
  useMyMembershipsQuery: () => useMyMembershipsSpy(),
  // `useSession` lives on `entities/me` after the 5.1a re-export.
  // The fixture mirrors the `auth-by-email` mock below so the
  // component sees the same actor regardless of which barrel it
  // reaches through.
  useSession: () => ({ data: { user: { id: ACTOR_ID, role: 'sysadmin' } } }),
}));

vi.mock('@/entities/organisation', async (orig) => {
  const actual = await orig<typeof import('@/entities/organisation')>();
  return {
    ...actual,
    listOrganisationsQueryOptions: vi.fn(() => ({
      queryKey: ['organisations'],
    })),
  };
});

vi.mock('@/entities/membership', () => ({
  listMembershipsQueryOptions: vi.fn(() => ({ queryKey: ['memberships'] })),
  useCreateMembership: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteMembership: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/entities/statistic', () => ({
  useOrganisationStatsQuery: () => useOrgStatsQuerySpy(),
}));

vi.mock('@/features/auth-by-email', () => ({
  useSession: () => ({ data: { user: { id: ACTOR_ID, role: 'sysadmin' } } }),
}));

import { MyOrganisationPage } from './MyOrganisationPage.js';

function org(over: Partial<Organisation> = {}): Organisation {
  return {
    id: ORG_A,
    parentId: null,
    type: 'club',
    shortCode: 'STK',
    slug: null,
    country: 'SWE',
    nameEn: 'Stockholm Club',
    nameSv: 'Stockholm Klubb',
    nameFi: 'Tukholma Klubi',
    nameJa: null,
    logoUrl: null,
    address: null,
    contactEmail: null,
    headInstructorId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function membership(
  over: Partial<OrganisationMembership> = {},
): OrganisationMembership {
  return {
    id: 'm-1',
    userId: 'u-other',
    organisationId: ORG_A,
    role: 'instructor',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...over,
  };
}

function makeAbility(): AppAbility {
  // Permissive stub — the page itself doesn't gate by ability; downstream
  // OrgMembershipManager does. We grant create/delete so the manager renders
  // its Add button (lets us assert "tab strip absent" without ambiguity).
  return {
    can: (action: string) => action === 'create' || action === 'delete',
  } as unknown as AppAbility;
}

function renderPage(): void {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={qc}>
      <I18nextProvider i18n={i18n}>
        <AbilityProvider value={makeAbility()}>
          <MyOrganisationPage />
        </AbilityProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
  useMyMembershipsSpy.mockReset();
  useOrgsQuerySpy.mockReset();
  useMembersQuerySpy.mockReset();
  useOrgStatsQuerySpy.mockReset();
  useMyMembershipsSpy.mockReturnValue({ data: [], isPending: false });
  useOrgsQuerySpy.mockReturnValue({ data: { data: [], total: 0 } });
  useMembersQuerySpy.mockReturnValue({
    data: { data: [], total: 0 },
    isPending: false,
  });
  useOrgStatsQuerySpy.mockReturnValue({
    data: undefined,
    isLoading: true,
    isError: false,
  });
});

describe('<MyOrganisationPage>', () => {
  it('shows a friendly empty state when the caller orgadmins nothing', () => {
    useMyMembershipsSpy.mockReturnValue({ data: [], isPending: false });

    renderPage();

    expect(
      screen.getByText(/do not currently administer/i),
    ).toBeInTheDocument();
    // No tab strip when there is nothing to tab between.
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('mounts the manager directly when the caller has exactly one orgadmin org', () => {
    useMyMembershipsSpy.mockReturnValue({
      data: [{ organisationId: ORG_A, role: 'orgadmin' }],
      isPending: false,
    });
    useOrgsQuerySpy.mockReturnValue({
      data: { data: [org({ id: ORG_A, nameEn: 'Stockholm Club' })], total: 1 },
    });
    useMembersQuerySpy.mockReturnValue({
      data: {
        data: [membership({ id: 'm-1', userId: 'u-other', role: 'instructor' })],
        total: 1,
      },
      isPending: false,
    });

    renderPage();

    // No tab strip in the single-org case.
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    // OrgMembershipManager's Add button is present, confirming the manager
    // mounted directly underneath the page header.
    expect(
      screen.getByRole('button', { name: /add member/i }),
    ).toBeInTheDocument();
  });

  it('renders the statistics section once the org stats query resolves', () => {
    useMyMembershipsSpy.mockReturnValue({
      data: [{ organisationId: ORG_A, role: 'orgadmin' }],
      isPending: false,
    });
    useOrgsQuerySpy.mockReturnValue({
      data: { data: [org({ id: ORG_A, nameEn: 'Stockholm Club' })], total: 1 },
    });
    useOrgStatsQuerySpy.mockReturnValue({
      data: {
        scope: { type: 'organisation', id: ORG_A, name: 'Stockholm Club' },
        metrics: {
          membershipCount: { student: 40, instructor: 6, orgadmin: 2 },
          gradingEventsMonthToDate: 12,
          activeUsersLast30Days: 30,
          feedbackThreadsOpenedMonthToDate: 3,
        },
        ranks: [
          {
            rank: { id: 'r1', nameRomaji: 'Shodan', nameEn: '1st Dan', sortOrder: 10 },
            count: 4,
          },
        ],
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
      isLoading: false,
      isError: false,
    });

    renderPage();

    expect(screen.getByText('Statistics')).toBeInTheDocument();
    expect(screen.getByText('Students')).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();
    expect(screen.getByText('Instructors')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText('Active users (30d)')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByText('Gradings this month')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /see full history/i }),
    ).toHaveAttribute('href', `/organisation/${ORG_A}/statistics`);
  });

  it('renders a tab strip with one tab per org when the caller has multiple', () => {
    useMyMembershipsSpy.mockReturnValue({
      data: [
        { organisationId: ORG_A, role: 'orgadmin' },
        { organisationId: ORG_B, role: 'orgadmin' },
      ],
      isPending: false,
    });
    useOrgsQuerySpy.mockReturnValue({
      data: {
        data: [
          org({ id: ORG_A, nameEn: 'Stockholm Club' }),
          org({ id: ORG_B, nameEn: 'Gothenburg Club' }),
        ],
        total: 2,
      },
    });

    renderPage();

    // Exactly one tab per orgadmin org.
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    expect(
      screen.getByRole('tab', { name: /Stockholm Club/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: /Gothenburg Club/i }),
    ).toBeInTheDocument();
  });
});
