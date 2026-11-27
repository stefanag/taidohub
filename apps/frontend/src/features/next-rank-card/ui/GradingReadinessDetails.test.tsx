import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GradingReadinessDetails } from './GradingReadinessDetails.js';

import i18n from '@/i18n';

const profile = vi.fn<() => { dateOfBirth: string | null }>();

vi.mock('@/entities/profile', () => ({
  myProfileQueryOptions: () => ({ queryKey: ['profile', 'me'], queryFn: async () => profile() }),
}));

vi.mock('@/shared/lib/grading-readiness', async (orig) => ({
  ...(await orig<typeof import('@/shared/lib/grading-readiness')>()),
  todayIso: () => '2026-11-27',
}));

function renderDetails(props: React.ComponentProps<typeof GradingReadinessDetails>) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nextProvider i18n={i18n}>
        <GradingReadinessDetails {...props} />
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
  profile.mockReturnValue({ dateOfBirth: '2010-01-01' });
});

describe('<GradingReadinessDetails>', () => {
  it('shows the earliest date while the time gate is open', async () => {
    renderDetails({ lastPassDate: '2026-06-01', minMonthsSincePreviousRank: 6, minAge: 13 });
    expect(await screen.findByText('Time in rank: 5 of 6 months')).toBeInTheDocument();
    expect(screen.getByTestId('grading-readiness-earliest')).toHaveTextContent('December 1, 2026');
  });

  it('says the gates are met once both dates have passed', async () => {
    renderDetails({ lastPassDate: '2026-01-01', minMonthsSincePreviousRank: 6, minAge: 13 });
    expect(await screen.findByTestId('grading-readiness-met')).toBeInTheDocument();
  });

  it('asks for a date of birth instead of guessing the age gate', async () => {
    profile.mockReturnValue({ dateOfBirth: null });
    renderDetails({ lastPassDate: '2026-01-01', minMonthsSincePreviousRank: null, minAge: 13 });
    expect(await screen.findByText(/Add your date of birth/)).toBeInTheDocument();
    expect(screen.queryByTestId('grading-readiness-earliest')).not.toBeInTheDocument();
  });

  it('renders nothing when the rank has neither gate', async () => {
    const { container } = renderDetails({
      lastPassDate: '2026-01-01',
      minMonthsSincePreviousRank: null,
      minAge: null,
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(container).toBeEmptyDOMElement();
  });
});
