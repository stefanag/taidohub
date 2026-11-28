import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { JoinRequestsReview } from './JoinRequestsReview.js';

import i18n from '@/i18n';
import { DEFAULT_FLAGS, FeatureFlagsProvider } from '@/shared/lib/feature-flags';

const memberships = vi.fn();
const pending = vi.fn();
const approve = vi.fn();

vi.mock('@/entities/me', () => ({ useMyMembershipsQuery: () => memberships() }));
vi.mock('@/entities/belt-rank', () => ({
  listBeltRanksQueryOptions: () => ({ queryKey: ['ranks'], queryFn: async () => [] }),
}));
vi.mock('@/entities/club-join-request', async (orig) => {
  const actual = await orig<typeof import('@/entities/club-join-request')>();
  return {
    ...actual,
    usePendingJoinRequestsQuery: (o: { enabled: boolean }) => pending(o),
    approveJoinRequest: (id: string) => approve(id),
  };
});

const REQUEST = {
  id: 'r-1',
  club: {
    id: 'c',
    shortCode: 'C',
    nameEn: 'Club',
    nameSv: 'Klubb',
    nameFi: 'Seura',
    country: null,
  },
  status: 'pending',
  message: 'Trained in Turku',
  applicant: { userId: 'u', name: 'Alex', email: 'alex@example.com', currentRankId: null },
  createdAt: '2026-11-27T10:00:00.000Z',
  decidedAt: null,
};

function renderReview() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <FeatureFlagsProvider flags={{ ...DEFAULT_FLAGS, 'club-join-requests': true }}>
        <I18nextProvider i18n={i18n}>
          <JoinRequestsReview />
        </I18nextProvider>
      </FeatureFlagsProvider>
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
  approve.mockReset().mockResolvedValue(REQUEST);
  pending.mockReturnValue({ data: [REQUEST] });
});

describe('<JoinRequestsReview>', () => {
  it('does not even ask for requests when the caller decides for no club', () => {
    memberships.mockReturnValue({ data: [{ role: 'student', organisationId: 'c' }] });
    expect(renderReview().container).toBeEmptyDOMElement();
    expect(pending).toHaveBeenCalledWith({ enabled: false });
  });

  it('lists a request with what the club may see, and approves it', async () => {
    memberships.mockReturnValue({ data: [{ role: 'instructor', organisationId: 'c' }] });
    renderReview();
    expect(screen.getByText('1 request to join')).toBeInTheDocument();
    expect(screen.getByText('Trained in Turku')).toBeInTheDocument();
    expect(screen.getByText(/current rank: none recorded/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(approve).toHaveBeenCalledWith('r-1'));
  });
});
