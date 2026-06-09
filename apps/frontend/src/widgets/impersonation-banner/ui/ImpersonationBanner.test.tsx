import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as authApi from '@/features/auth-by-email';
import i18n from '@/i18n';

const stopMutate = vi.fn();
vi.mock('@/features/user-impersonation', () => ({
  useStopImpersonating: () => ({ mutate: stopMutate, isPending: false }),
}));

import { ImpersonationBanner } from './ImpersonationBanner.js';

function renderBanner(): ReturnType<typeof render> {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <I18nextProvider i18n={i18n}>
        <ImpersonationBanner />
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

describe('<ImpersonationBanner>', () => {
  beforeEach(async () => {
    stopMutate.mockReset();
    await i18n.changeLanguage('en');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the banner with the impersonated user info', () => {
    vi.spyOn(authApi, 'useSession').mockReturnValue({
      data: {
        user: { id: 't-1', name: 'Ada', email: 'ada@x' },
        session: {
          id: 's',
          expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
          impersonatedBy: 's-1',
        },
      },
      isPending: false,
      error: null,
      refetch: () => Promise.resolve(),
    } as unknown as ReturnType<typeof authApi.useSession>);

    renderBanner();

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText(/Ada|ada@x/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Stop impersonating/i }),
    ).toBeInTheDocument();
  });

  it('renders null when the session is not impersonated', () => {
    vi.spyOn(authApi, 'useSession').mockReturnValue({
      data: {
        user: { id: 'u', email: 'u@x' },
        session: { id: 's' },
      },
      isPending: false,
      error: null,
      refetch: () => Promise.resolve(),
    } as unknown as ReturnType<typeof authApi.useSession>);

    const { container } = renderBanner();

    expect(container).toBeEmptyDOMElement();
  });
});
