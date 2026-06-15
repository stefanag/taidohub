import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ListMembershipsResponse,
  OrganisationMembership,
} from '@/entities/membership';
import type {
  ListOrganisationsResponse,
  Organisation,
} from '@/entities/organisation';
import { AbilityContext, type AppAbility } from '@/shared/lib/casl';

import i18n from '@/i18n';

// jsdom missing pointer APIs for Radix Dialog/Sheet/Select/Dropdown.
window.HTMLElement.prototype.hasPointerCapture ??= vi.fn(() => false);
window.HTMLElement.prototype.setPointerCapture ??= vi.fn();
window.HTMLElement.prototype.releasePointerCapture ??= vi.fn();
window.HTMLElement.prototype.scrollIntoView ??= vi.fn();

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_ID = 'actor-user';

// --- Stub @tanstack/react-router so the page doesn't fight a missing router ---
const navigateMock = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  useSearch: () => ({}),
}));

// --- Stub the organisation entity (list + mutations) -------------------------
const useOrgsQuerySpy = vi.fn<
  () => {
    data: ListOrganisationsResponse | undefined;
    isLoading: boolean;
    isError: boolean;
    error: unknown;
  }
>(() => ({
  data: undefined,
  isLoading: false,
  isError: false,
  error: null,
}));

const useMembersQuerySpy = vi.fn<
  () => { data: ListMembershipsResponse | undefined; isPending: boolean }
>(() => ({ data: { data: [], total: 0 }, isPending: false }));

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

vi.mock('@/entities/organisation', async (orig) => {
  const actual = await orig<typeof import('@/entities/organisation')>();
  return {
    ...actual,
    listOrganisationsQueryOptions: vi.fn(() => ({
      queryKey: ['organisations'],
    })),
    useCreateOrganisation: () => ({
      mutateAsync: vi.fn(),
      isPending: false,
    }),
    useUpdateOrganisation: () => ({
      mutateAsync: vi.fn(),
      isPending: false,
    }),
    useDeleteOrganisation: () => ({
      mutateAsync: vi.fn(),
      isPending: false,
    }),
  };
});

vi.mock('@/entities/membership', () => ({
  listMembershipsQueryOptions: vi.fn(() => ({ queryKey: ['memberships'] })),
  useCreateMembership: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteMembership: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/features/auth-by-email', () => ({
  useSession: () => ({ data: { user: { id: ACTOR_ID, role: 'sysadmin' } } }),
}));

// LabelsFilterBar pulls its own data; stub it out as a no-op for this test.
vi.mock('@/features/labels', () => ({
  LabelsFilterBar: () => null,
  LabelsAttacher: () => null,
}));

import { AdminOrganisationsPage } from './AdminOrganisationsPage.js';

function org(over: Partial<Organisation> = {}): Organisation {
  return {
    id: ORG_ID,
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

function makeAbility(): AppAbility {
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
        <AbilityContext.Provider value={makeAbility()}>
          <AdminOrganisationsPage />
        </AbilityContext.Provider>
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
  useOrgsQuerySpy.mockReset();
  useMembersQuerySpy.mockReset();
  navigateMock.mockReset();
});

describe('<AdminOrganisationsPage>', () => {
  it('clicking the Members menu item opens the membership manager sheet', async () => {
    useOrgsQuerySpy.mockReturnValue({
      data: { data: [org()] as Organisation[], total: 1 } as unknown as ListOrganisationsResponse,
      isLoading: false,
      isError: false,
      error: null,
    });
    useMembersQuerySpy.mockReturnValue({
      data: { data: [] as OrganisationMembership[], total: 0 } as ListMembershipsResponse,
      isPending: false,
    });

    const user = userEvent.setup();
    renderPage();

    // The row renders with the actions dropdown.
    expect(screen.getByText('Stockholm Club')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Actions'));
    await user.click(await screen.findByRole('menuitem', { name: /members/i }));

    // Both the sheet's <SheetTitle> and the manager's internal heading carry
    // the interpolated org label — assert at least one is present, then check
    // that the manager itself mounted (its Add Member button is visible
    // because the ability stub allows create).
    const titles = await screen.findAllByText(/members of stockholm club/i);
    expect(titles.length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByRole('button', { name: /add member/i }),
    ).toBeInTheDocument();
  });
});
