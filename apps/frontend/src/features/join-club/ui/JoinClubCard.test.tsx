import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { JoinClubCard } from './JoinClubCard.js';

import i18n from '@/i18n';
import { DEFAULT_FLAGS, FeatureFlagsProvider } from '@/shared/lib/feature-flags';

const memberships = vi.fn();
const mine = vi.fn();
const cancel = vi.fn();
const CLUB = {
  id: 'c-1',
  shortCode: 'STK',
  nameEn: 'Stockholm',
  nameSv: 'Stockholm SV',
  nameFi: '',
  country: 'SE',
};

vi.mock('@/entities/me', () => ({ useMyMembershipsQuery: () => memberships() }));
vi.mock('@/entities/club-join-request', async (orig) => {
  const actual = await orig<typeof import('@/entities/club-join-request')>();
  return {
    ...actual,
    useMyJoinRequestsQuery: () => mine(),
    useJoinableClubsQuery: () => ({ data: [CLUB] }),
    cancelJoinRequest: (id: string) => cancel(id),
  };
});

const ok = (data: unknown) => ({ data, isPending: false, isSuccess: true });

function renderCard(flag = true) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <FeatureFlagsProvider flags={{ ...DEFAULT_FLAGS, 'club-join-requests': flag }}>
        <I18nextProvider i18n={i18n}>
          <JoinClubCard />
        </I18nextProvider>
      </FeatureFlagsProvider>
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
  memberships.mockReturnValue(ok([]));
  mine.mockReturnValue(ok([]));
  cancel.mockReset().mockResolvedValue(undefined);
});

describe('<JoinClubCard>', () => {
  it('renders nothing for club members or with the flag off', () => {
    memberships.mockReturnValue(ok([{ role: 'student' }]));
    expect(renderCard().container).toBeEmptyDOMElement();
    memberships.mockReturnValue(ok([]));
    expect(renderCard(false).container).toBeEmptyDOMElement();
  });

  it('offers the form, and says what the club will see', () => {
    renderCard();
    expect(screen.getByRole('button', { name: 'Send request' })).toBeDisabled();
    expect(screen.getByText(/The club will see your name/)).toBeInTheDocument();
  });

  it('shows a pending request and lets the user cancel it', async () => {
    mine.mockReturnValue(
      ok([
        {
          id: 'r-1',
          club: CLUB,
          status: 'pending',
          createdAt: '2026-11-27T10:00:00.000Z',
          message: null,
        },
      ]),
    );
    renderCard();
    expect(screen.getByTestId('join-club-pending')).toHaveTextContent('Stockholm');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel request' }));
    await waitFor(() => expect(cancel).toHaveBeenCalledWith('r-1'));
  });

  it('tells the user when the club declined', () => {
    mine.mockReturnValue(
      ok([{ id: 'r-1', club: CLUB, status: 'declined', createdAt: '2026-11-27T10:00:00.000Z' }]),
    );
    renderCard();
    expect(screen.getByRole('note')).toHaveTextContent('Stockholm declined your request');
  });
});
