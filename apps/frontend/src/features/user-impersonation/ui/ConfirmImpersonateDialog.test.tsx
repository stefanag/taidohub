import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import i18n from '@/i18n';

const startSpy = vi.fn().mockResolvedValue(undefined);
vi.mock('@/shared/api', async (orig) => {
  const actual = await orig<typeof import('@/shared/api')>();
  return {
    ...actual,
    httpClient: (url: string, init?: { body?: { userId?: string } }) => {
      if (url === '/api/admin/impersonate-user') {
        return startSpy(init?.body?.userId);
      }
      return Promise.resolve({});
    },
  };
});

import { ConfirmImpersonateDialog } from './ConfirmImpersonateDialog.js';

function renderDialog() {
  const onOpenChange = vi.fn();
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <I18nextProvider i18n={i18n}>
        <ConfirmImpersonateDialog
          open
          onOpenChange={onOpenChange}
          targetUser={{ id: 't-1', name: 'Ada', email: 'ada@x' }}
        />
      </I18nextProvider>
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

describe('<ConfirmImpersonateDialog>', () => {
  beforeEach(async () => {
    startSpy.mockClear();
    await i18n.changeLanguage('en');
  });

  it('renders the target user name in the title', () => {
    renderDialog();
    // The interpolated `{{name}}` plug-in is i18next-managed — works even if
    // the key text falls back to its raw form.
    expect(screen.getByText(/Ada|ada@x/)).toBeInTheDocument();
  });

  it('calls startImpersonating with the target id on confirm', async () => {
    renderDialog();
    const user = userEvent.setup();
    // Pick the confirm button by accessible name. The dialog renders three
    // buttons: the auto-generated close (X), Cancel, and "Start impersonating".
    const confirmBtn = screen.getByRole('button', { name: /start impersonating/i });
    await user.click(confirmBtn);
    await waitFor(() => {
      expect(startSpy).toHaveBeenCalledWith('t-1');
    });
  });
});
