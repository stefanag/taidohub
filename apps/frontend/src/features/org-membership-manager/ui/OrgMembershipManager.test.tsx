import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ListMembershipsResponse,
  OrganisationMembership,
} from '@/entities/membership';
import { HttpError } from '@/shared/api';
import { AbilityContext, type AppAbility } from '@/shared/lib/casl';

import i18n from '@/i18n';

const ORG_ID = 'org-1';
const ACTOR_ID = 'actor-user';

// jsdom missing pointer APIs for Radix Dialog/Select.
window.HTMLElement.prototype.hasPointerCapture ??= vi.fn(() => false);
window.HTMLElement.prototype.setPointerCapture ??= vi.fn();
window.HTMLElement.prototype.releasePointerCapture ??= vi.fn();
window.HTMLElement.prototype.scrollIntoView ??= vi.fn();

// --- Stubs for the membership entity ----------------------------------------
const useQuerySpy = vi.fn<() => { data: ListMembershipsResponse | undefined; isPending: boolean }>(
  () => ({ data: undefined, isPending: true }),
);
const createMutateAsync = vi.fn(async () => undefined as never);
const deleteMutateAsync = vi.fn(async () => undefined);

vi.mock('@tanstack/react-query', async (orig) => {
  const actual = await orig<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQuery: () => useQuerySpy(),
  };
});

vi.mock('@/entities/membership', () => ({
  listMembershipsQueryOptions: vi.fn(() => ({ queryKey: ['memberships'] })),
  useCreateMembership: () => ({ mutateAsync: createMutateAsync, isPending: false }),
  useDeleteMembership: () => ({ mutateAsync: deleteMutateAsync, isPending: false }),
}));

vi.mock('@/features/auth-by-email', () => ({
  useSession: () => ({ data: { user: { id: ACTOR_ID, role: 'sysadmin' } } }),
}));

import { OrgMembershipManager } from './OrgMembershipManager.js';

function makeAbility(opts: {
  canCreate?: boolean;
  canDelete?: boolean;
} = {}): AppAbility {
  // Minimal CASL-shaped stub. The component only calls `.can(action, subject)`.
  const canCreate = opts.canCreate ?? true;
  const canDelete = opts.canDelete ?? true;
  return {
    can: (action: string) => {
      if (action === 'create') return canCreate;
      if (action === 'delete') return canDelete;
      return false;
    },
  } as unknown as AppAbility;
}

function membership(
  overrides: Partial<OrganisationMembership> = {},
): OrganisationMembership {
  return {
    id: 'm-1',
    userId: 'u-other',
    organisationId: ORG_ID,
    role: 'instructor',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderManager(ability: AppAbility | null = makeAbility()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <I18nextProvider i18n={i18n}>
        <AbilityContext.Provider value={ability}>
          <OrgMembershipManager
            organisationId={ORG_ID}
            orgLabel="Stockholm Club"
          />
        </AbilityContext.Provider>
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
  useQuerySpy.mockReset();
  createMutateAsync.mockReset();
  deleteMutateAsync.mockReset();
});

describe('<OrgMembershipManager>', () => {
  it('renders org-scope rows from the memberships query', () => {
    useQuerySpy.mockReturnValue({
      data: {
        data: [
          membership({ id: 'm-1', userId: 'u-instructor', role: 'instructor' }),
          membership({ id: 'm-2', userId: 'u-orgadmin', role: 'orgadmin' }),
        ],
        total: 2,
      },
      isPending: false,
    });

    renderManager();

    expect(screen.getByText('u-instructor')).toBeInTheDocument();
    expect(screen.getByText('u-orgadmin')).toBeInTheDocument();
  });

  it('shows the Add button when the ability grants create on either role', () => {
    useQuerySpy.mockReturnValue({
      data: { data: [], total: 0 },
      isPending: false,
    });

    renderManager(makeAbility({ canCreate: true }));

    expect(
      screen.getByRole('button', { name: /add member/i }),
    ).toBeInTheDocument();
  });

  it("hides the Remove button on the actor's own orgadmin row", () => {
    useQuerySpy.mockReturnValue({
      data: {
        data: [
          // Actor's own orgadmin row — Remove must NOT render here.
          membership({ id: 'm-self', userId: ACTOR_ID, role: 'orgadmin' }),
          // Someone else's instructor row — Remove SHOULD render here.
          membership({ id: 'm-other', userId: 'u-other', role: 'instructor' }),
        ],
        total: 2,
      },
      isPending: false,
    });

    renderManager(makeAbility({ canDelete: true }));

    const removeButtons = screen.getAllByRole('button', { name: /remove/i });
    // Exactly one Remove button — for the OTHER row, not the actor's own.
    expect(removeButtons).toHaveLength(1);
    // The row containing the actor's id should have no Remove button.
    const selfRow = screen.getByText(ACTOR_ID).closest('tr');
    expect(selfRow).not.toBeNull();
    expect(
      selfRow?.querySelector('button'),
    ).toBeNull();
  });

  it('catches LAST_ORGADMIN 409 and surfaces the confirm dialog', async () => {
    useQuerySpy.mockReturnValue({
      data: {
        data: [membership({ id: 'm-last', userId: 'u-other', role: 'orgadmin' })],
        total: 1,
      },
      isPending: false,
    });

    // First delete: backend says LAST_ORGADMIN. After confirm, succeed.
    deleteMutateAsync.mockImplementationOnce(() => {
      return Promise.reject(
        new HttpError(409, {
          code: 'LAST_ORGADMIN',
          message: 'last orgadmin',
        }),
      );
    });

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderManager(makeAbility({ canDelete: true }));

    fireEvent.click(screen.getByRole('button', { name: /remove/i }));

    // The confirm-last-orgadmin dialog should appear after the soft block.
    await waitFor(() => {
      expect(
        screen.getByRole('dialog', { name: /last-orgadmin/i }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText(/only org administrator/i),
    ).toBeInTheDocument();

    confirmSpy.mockRestore();
  });
});
