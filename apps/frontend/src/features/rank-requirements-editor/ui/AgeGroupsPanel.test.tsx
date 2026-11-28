import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgeGroupsPanel } from './AgeGroupsPanel.js';

import i18n from '@/i18n';
import { HttpError } from '@/shared/api';

const RANK = '11111111-1111-4111-8111-111111111111';
const SET = '22222222-2222-4222-8222-222222222222';
const api = vi.hoisted(() => ({ getRequirementsForSet: vi.fn(), setAgeGroups: vi.fn() }));

vi.mock('@/entities/rank-requirement/api/rank-requirement.api.js', async (orig) => ({
  ...(await orig<typeof import('@/entities/rank-requirement/api/rank-requirement.api.js')>()),
  getRequirementsForSet: api.getRequirementsForSet,
  setAgeGroups: api.setAgeGroups,
}));

const GROUPS = [
  { id: 'ag-young', ageFrom: null, ageTo: 11 },
  { id: 'ag-teen', ageFrom: 12, ageTo: 15 },
];

function renderPanel(selected: string | null = null) {
  const onSelect = vi.fn();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nextProvider i18n={i18n}>
        <AgeGroupsPanel rankId={RANK} setId={SET} selected={selected} onSelect={onSelect} />
      </I18nextProvider>
    </QueryClientProvider>,
  );
  return { onSelect, user: userEvent.setup() };
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
  api.getRequirementsForSet.mockReset().mockResolvedValue({ ageGroups: GROUPS });
  api.setAgeGroups.mockReset().mockResolvedValue({ ageGroups: GROUPS });
});

describe('<AgeGroupsPanel>', () => {
  it('shows a tab per age group and selects one', async () => {
    const { onSelect, user } = renderPanel();
    expect(await screen.findByRole('button', { name: 'Under 12' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All ages' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByRole('button', { name: '12–15 years' }));
    expect(onSelect).toHaveBeenCalledWith('ag-teen');
  });

  it('saves the edited list, keeping ids of existing groups', async () => {
    const { user } = renderPanel();
    await user.click(await screen.findByRole('button', { name: 'Manage age groups' }));
    await user.click(screen.getByRole('button', { name: 'Add age group' }));
    await user.type(screen.getByLabelText('From age', { selector: '#ag-from-2' }), '16');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.setAgeGroups).toHaveBeenCalled());
    expect(api.setAgeGroups.mock.calls[0]![1]).toEqual({
      setId: SET,
      groups: [
        { id: 'ag-young', ageFrom: null, ageTo: 11 },
        { id: 'ag-teen', ageFrom: 12, ageTo: 15 },
        { ageFrom: 16, ageTo: null },
      ],
    });
  });

  it('explains a refusal from the server', async () => {
    api.setAgeGroups.mockRejectedValue(
      new HttpError(400, { code: 'AGE_GROUPS_OVERLAP', message: 'x' }),
    );
    const { user } = renderPanel();
    await user.click(await screen.findByRole('button', { name: 'Manage age groups' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Age groups must not overlap.');
  });

  it('refuses a group without any bound before asking the server', async () => {
    const { user } = renderPanel();
    await user.click(await screen.findByRole('button', { name: 'Manage age groups' }));
    await user.click(screen.getByRole('button', { name: 'Add age group' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('at least one age');
    expect(api.setAgeGroups).not.toHaveBeenCalled();
  });
});
