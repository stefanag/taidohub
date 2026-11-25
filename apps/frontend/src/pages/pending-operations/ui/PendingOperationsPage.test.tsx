import { QueryClient, QueryClientProvider, queryOptions } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PendingOperationsPage } from './PendingOperationsPage.js';

import i18n from '@/i18n';

const approve = vi.fn();
const reject = vi.fn();
let operations: unknown[] = [];

let ranks: unknown[] = [];
vi.mock('@/entities/belt-rank', () => ({
  listBeltRanksQueryOptions: () =>
    queryOptions({ queryKey: ['belt-ranks'], queryFn: async () => ranks }),
}));

// Mock the entity barrel (not deep paths) so the FSD public-API rule holds.
vi.mock('@/entities/pending-operation', () => ({
  pendingOperationsQueryOptions: () =>
    queryOptions({ queryKey: ['pending-operations'], queryFn: async () => ({ data: operations }) }),
  useApprovePendingOperation: () => ({ mutate: approve, isPending: false, isError: false }),
  useRejectPendingOperation: () => ({ mutate: reject, isPending: false, isError: false }),
}));

const preview = {
  studentUserId: 'u-2',
  studentName: 'Aino Virtanen',
  rankId: '22222222-2222-4222-8222-222222222222',
  rankName: '4th Kyu',
  date: '2026-11-20',
  shogoTitle: null,
  examinerName: 'Sensei Test',
  organisationName: null,
  notes: null,
};

function op(id: string, status: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    type: 'rank_history.create',
    status,
    params: { studentUserId: 'u-2', rankId: preview.rankId, date: preview.date },
    preview,
    createdByUserId: 'u-1',
    createdVia: 'mcp',
    resultEntityId: null,
    error: null,
    createdAt: '2026-11-24T10:00:00.000Z',
    decidedAt: null,
    ...extra,
  };
}

function renderPage(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PendingOperationsPage />
    </QueryClientProvider>,
  );
}

describe('<PendingOperationsPage>', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    ranks = [];
    await i18n.changeLanguage('en');
  });

  it('names the rank in the UI language, not as stored in the proposal', async () => {
    operations = [op('op-3', 'pending')];
    ranks = [
      { id: preview.rankId, nameRomaji: 'Yonkyu', nameEn: '4th Kyu', nameSv: '4 Kyu', nameFi: '4. Kyu' },
    ];
    await i18n.changeLanguage('sv');
    try {
      renderPage();
      expect(await screen.findByText(/Registrera Yonkyu — 4 Kyu för Aino Virtanen/)).toBeInTheDocument();
      expect(screen.queryByText(/4th Kyu/)).not.toBeInTheDocument();
    } finally {
      await i18n.changeLanguage('en');
    }
  });

  it('says so when nothing is waiting', async () => {
    operations = [];
    renderPage();
    expect(await screen.findByText('Nothing is waiting for approval.')).toBeInTheDocument();
  });

  it('shows a pending proposal with its details and sends approve or reject', async () => {
    operations = [op('op-1', 'pending')];
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('Record 4th Kyu for Aino Virtanen')).toBeInTheDocument();
    expect(screen.getByText('Sensei Test')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Approve' }));
    expect(approve).toHaveBeenCalledWith('op-1');
    await user.click(screen.getByRole('button', { name: 'Reject' }));
    expect(reject).toHaveBeenCalledWith('op-1');
  });

  it('lists decided proposals without actions, with the reason a failed one was not saved', async () => {
    operations = [op('op-2', 'failed', { error: 'Cannot record history for this user.' })];
    renderPage();

    expect(await screen.findByText('Not saved: Cannot record history for this user.')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
  });
});
