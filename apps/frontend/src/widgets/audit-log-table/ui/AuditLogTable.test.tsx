import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as auditLogApi from '@/entities/audit-log/api/audit-log.api.js';
import i18n from '@/i18n';

// The `listAuditLogQueryOptions` factory captures the real `listAuditLog`
// reference at import time, so mocking the barrel (`@/entities/audit-log`)
// would have no effect on the query function. Mock the API module that
// owns the exported fetcher instead.
vi.mock('@/entities/audit-log/api/audit-log.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/audit-log/api/audit-log.api.js')>();
  return { ...actual, listAuditLog: vi.fn() };
});

import { AuditLogTable } from './AuditLogTable.js';

function renderWithProviders(ui: React.ReactElement): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const FIXTURE_ROW = {
  id: '00000000-0000-4000-8000-000000000001',
  entityType: 'organisation',
  entityId: 'org-1',
  action: 'update' as const,
  userId: 'u-admin',
  before: { name: 'Old' },
  after: { name: 'New' },
  createdAt: '2026-05-17T08:00:00.000Z',
};

describe('<AuditLogTable>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the empty state when the API returns no rows', async () => {
    vi.mocked(auditLogApi.listAuditLog).mockResolvedValue({
      data: [],
      page: 1,
      perPage: 25,
      total: 0,
    });

    renderWithProviders(<AuditLogTable query={{ page: 1, perPage: 25 }} />);

    await waitFor(() => {
      expect(screen.getByText(/no audit entries/i)).toBeInTheDocument();
    });
  });

  it('renders one row per entry with the right action label', async () => {
    vi.mocked(auditLogApi.listAuditLog).mockResolvedValue({
      data: [FIXTURE_ROW],
      page: 1,
      perPage: 25,
      total: 1,
    });

    renderWithProviders(<AuditLogTable query={{ page: 1, perPage: 25 }} />);

    await waitFor(() => {
      expect(screen.getByText(/updated/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/organisation:org-1/i)).toBeInTheDocument();
    expect(screen.getByText(/u-admin/i)).toBeInTheDocument();
  });

  it('expands a row to reveal before / after JSON, then collapses', async () => {
    vi.mocked(auditLogApi.listAuditLog).mockResolvedValue({
      data: [FIXTURE_ROW],
      page: 1,
      perPage: 25,
      total: 1,
    });

    const user = userEvent.setup();
    renderWithProviders(<AuditLogTable query={{ page: 1, perPage: 25 }} />);

    await waitFor(() => {
      expect(screen.getByText(/organisation:org-1/i)).toBeInTheDocument();
    });

    // Initially collapsed — before/after labels shouldn't be in the doc.
    expect(screen.queryByText('before')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /expand/i }));

    expect(screen.getByText('before')).toBeInTheDocument();
    expect(screen.getByText('after')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /collapse/i }));
    expect(screen.queryByText('before')).not.toBeInTheDocument();
  });
});
