import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminRequirementSetsPage } from './AdminRequirementSetsPage.js';

import type { RequirementSet } from '@repo/contracts';

const ACTIVE_SET: RequirementSet = {
  id: 'set-active',
  name: 'Dan grading 2026',
  organisationId: null,
  effectiveDate: '2026-01-01',
  isActive: true,
  clonedFromId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const INACTIVE_SET: RequirementSet = {
  id: 'set-inactive',
  name: 'Kyu grading draft',
  organisationId: 'org-1',
  effectiveDate: '2026-02-01',
  isActive: false,
  clonedFromId: null,
  createdAt: '2026-01-05T00:00:00.000Z',
  updatedAt: '2026-01-05T00:00:00.000Z',
};

const getRequirementSets = vi.fn();
const createRequirementSet = vi.fn();
const activateRequirementSet = vi.fn();
const deactivateRequirementSet = vi.fn();
const cloneRequirementSet = vi.fn();
const deleteRequirementSet = vi.fn();
const updateRequirementSet = vi.fn();

vi.mock('@/entities/requirement-set/api/requirement-set.api.js', async (orig) => {
  const actual =
    await orig<typeof import('@/entities/requirement-set/api/requirement-set.api.js')>();
  return {
    ...actual,
    getRequirementSets: (...args: unknown[]) => getRequirementSets(...args),
    createRequirementSet: (...args: unknown[]) => createRequirementSet(...args),
    activateRequirementSet: (...args: unknown[]) => activateRequirementSet(...args),
    deactivateRequirementSet: (...args: unknown[]) => deactivateRequirementSet(...args),
    cloneRequirementSet: (...args: unknown[]) => cloneRequirementSet(...args),
    deleteRequirementSet: (...args: unknown[]) => deleteRequirementSet(...args),
    updateRequirementSet: (...args: unknown[]) => updateRequirementSet(...args),
  };
});

vi.mock('@/entities/organisation/api/organisation.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/organisation/api/organisation.api.js')>();
  return { ...actual, listOrganisations: vi.fn().mockResolvedValue({ data: [], total: 0 }) };
});

vi.mock('@/entities/me/api/me.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/me/api/me.api.js')>();
  return { ...actual, getMyMemberships: vi.fn().mockResolvedValue([]) };
});

// Sysadmin session so the page's `canManage` gate passes without relying on
// memberships or the (unmocked, null-by-default) CASL AbilityContext.
vi.mock('@/features/auth-by-email', async (orig) => {
  const actual = await orig<typeof import('@/features/auth-by-email')>();
  return {
    ...actual,
    useSession: () => ({ data: { user: { id: 'sysadmin-1', role: 'sysadmin' } } }),
  };
});

import i18n from '@/i18n';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <AdminRequirementSetsPage />
      </I18nextProvider>
    </QueryClientProvider>,
  );
  return { user: userEvent.setup() };
}

describe('<AdminRequirementSetsPage>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    vi.clearAllMocks();
    getRequirementSets.mockResolvedValue([ACTIVE_SET, INACTIVE_SET]);
    createRequirementSet.mockResolvedValue({ ...ACTIVE_SET, id: 'set-new' });
    activateRequirementSet.mockResolvedValue({ ...INACTIVE_SET, isActive: true });
    deactivateRequirementSet.mockResolvedValue({ ...ACTIVE_SET, isActive: false });
    cloneRequirementSet.mockResolvedValue({ ...ACTIVE_SET, id: 'set-clone' });
    deleteRequirementSet.mockResolvedValue(undefined);
    updateRequirementSet.mockResolvedValue({ ...ACTIVE_SET, name: 'Updated name' });
  });

  it('renders both requirement-set rows from the list query', async () => {
    renderPage();
    expect(await screen.findByText('Dan grading 2026')).toBeInTheDocument();
    expect(screen.getByText('Kyu grading draft')).toBeInTheDocument();
  });

  it('shows Active/Inactive badges matching each row state', async () => {
    renderPage();
    const activeRow = (await screen.findByTestId('requirement-set-row-set-active')) as HTMLElement;
    const inactiveRow = screen.getByTestId('requirement-set-row-set-inactive');
    expect(within(activeRow).getByText(/^active$/i)).toBeInTheDocument();
    expect(within(inactiveRow).getByText(/^inactive$/i)).toBeInTheDocument();
  });

  it('shows Deactivate on the active row and Activate on the inactive row', async () => {
    renderPage();
    const activeRow = (await screen.findByTestId('requirement-set-row-set-active')) as HTMLElement;
    const inactiveRow = screen.getByTestId('requirement-set-row-set-inactive');
    expect(within(activeRow).getByRole('button', { name: /deactivate/i })).toBeInTheDocument();
    expect(within(activeRow).queryByRole('button', { name: /^activate$/i })).not.toBeInTheDocument();
    expect(within(inactiveRow).getByRole('button', { name: /^activate$/i })).toBeInTheDocument();
    expect(within(inactiveRow).queryByRole('button', { name: /deactivate/i })).not.toBeInTheDocument();
  });

  it('clicking Activate calls the activate mutation with the row id', async () => {
    const { user } = renderPage();
    const inactiveRow = await screen.findByTestId('requirement-set-row-set-inactive');
    await user.click(within(inactiveRow).getByRole('button', { name: /^activate$/i }));
    await waitFor(() => expect(activateRequirementSet).toHaveBeenCalledWith('set-inactive'));
  });

  it('clicking Deactivate calls the deactivate mutation with the row id', async () => {
    const { user } = renderPage();
    const activeRow = await screen.findByTestId('requirement-set-row-set-active');
    await user.click(within(activeRow).getByRole('button', { name: /deactivate/i }));
    await waitFor(() => expect(deactivateRequirementSet).toHaveBeenCalledWith('set-active'));
  });

  it('Clone opens a dialog prompting for a name, and confirms via the clone mutation', async () => {
    const { user } = renderPage();
    const activeRow = await screen.findByTestId('requirement-set-row-set-active');
    await user.click(within(activeRow).getByRole('button', { name: /clone/i }));

    const dialog = await screen.findByRole('dialog');
    const nameInput = within(dialog).getByLabelText(/name for cloned set/i);
    await user.type(nameInput, 'Dan grading 2026 (copy)');
    await user.click(within(dialog).getByRole('button', { name: /clone/i }));

    await waitFor(() =>
      expect(cloneRequirementSet).toHaveBeenCalledWith('set-active', {
        name: 'Dan grading 2026 (copy)',
      }),
    );
  });

  it('Delete opens a confirm dialog before calling the delete mutation', async () => {
    const { user } = renderPage();
    const activeRow = await screen.findByTestId('requirement-set-row-set-active');
    await user.click(within(activeRow).getByRole('button', { name: /delete/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/cannot be undone/i)).toBeInTheDocument();
    expect(deleteRequirementSet).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: /delete/i }));
    await waitFor(() => expect(deleteRequirementSet).toHaveBeenCalledWith('set-active'));
  });

  it('Edit opens a dialog pre-filled with the row values and submits via the update mutation', async () => {
    const { user } = renderPage();
    const activeRow = await screen.findByTestId('requirement-set-row-set-active');
    await user.click(within(activeRow).getByRole('button', { name: /edit/i }));

    const dialog = await screen.findByRole('dialog');
    const nameInput = within(dialog).getByLabelText(/^name$/i) as HTMLInputElement;
    expect(nameInput.value).toBe('Dan grading 2026');

    await user.clear(nameInput);
    await user.type(nameInput, 'Updated name');
    await user.click(within(dialog).getByRole('button', { name: /save/i }));

    await waitFor(() =>
      expect(updateRequirementSet).toHaveBeenCalledWith('set-active', {
        name: 'Updated name',
        effectiveDate: '2026-01-01',
      }),
    );
  });

  it('submits the create-set form with name, effectiveDate, and organisationId', async () => {
    const { user } = renderPage();
    await user.click(await screen.findByRole('button', { name: /new set/i }));

    const dialog = await screen.findByRole('dialog');
    const nameInput = within(dialog).getByLabelText(/^name$/i);
    await user.type(nameInput, 'New requirement set');
    await user.click(within(dialog).getByRole('button', { name: /save/i }));

    await waitFor(() => expect(createRequirementSet).toHaveBeenCalledTimes(1));
    const [payload] = createRequirementSet.mock.calls[0] as [
      { name: string; effectiveDate: string; organisationId: string | null },
    ];
    expect(payload.name).toBe('New requirement set');
    expect(payload.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Sysadmin session in this test → org left null (global) by default.
    expect(payload.organisationId).toBeNull();
  });
});
