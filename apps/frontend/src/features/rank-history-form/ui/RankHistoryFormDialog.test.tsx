import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RankHistoryFormDialog } from './RankHistoryFormDialog.js';

import type { GradingHistoryRow } from '@/entities/rank-history';

import i18n from '@/i18n';

// Radix UI Select uses pointer-capture and scrollIntoView APIs that jsdom does not implement.
// Stub them so the dropdown can open and dismiss in tests.
window.Element.prototype.hasPointerCapture = vi.fn() as unknown as typeof window.Element.prototype.hasPointerCapture;
window.Element.prototype.setPointerCapture = vi.fn() as unknown as typeof window.Element.prototype.setPointerCapture;
window.Element.prototype.releasePointerCapture = vi.fn() as unknown as typeof window.Element.prototype.releasePointerCapture;
window.Element.prototype.scrollIntoView = vi.fn() as unknown as typeof window.Element.prototype.scrollIntoView;

vi.mock('@/entities/belt-rank/api/belt-rank.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/belt-rank/api/belt-rank.api.js')>();
  return {
    ...actual,
    getBeltRanks: vi.fn().mockResolvedValue([
      {
        id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        organisationId: null,
        systemId: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6f',
        level: 1,
        sortOrder: 100,
        nameJa: '初段',
        nameRomaji: 'Shodan',
        nameEn: '1st Dan',
        nameSv: '1 Dan',
        nameFi: '1. Dan',
        beltColor: '#000000',
        imageUrl: null,
        descriptionEn: null,
        descriptionSv: null,
        descriptionFi: null,
        publiclyVisible: false,
        slug: null,
        minAge: null,
        nextRankId: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]),
  };
});

vi.mock('@/entities/shogo-title/api/shogo-title.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/shogo-title/api/shogo-title.api.js')>();
  return {
    ...actual,
    getShogoTitles: vi.fn().mockResolvedValue([
      {
        code: 'renshi',
        nameEn: 'Renshi',
        nameSv: 'Renshi',
        nameFi: 'Renshi',
        nameJa: '錬士',
        minRankId: 'rank-yondan',
        sortOrder: 1,
      },
    ]),
  };
});

vi.mock('@/features/auth-by-email/api/auth.api.js', async (orig) => {
  const actual = await orig<typeof import('@/features/auth-by-email/api/auth.api.js')>();
  return {
    ...actual,
    authClient: {
      ...actual.authClient,
      getSession: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
  };
});

vi.mock('@/entities/rank-history/api/rank-history.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/rank-history/api/rank-history.api.js')>();
  return {
    ...actual,
    createRankHistory: vi.fn().mockResolvedValue({
      id: 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f',
      userId: 'u-1',
      rankId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      shogoTitle: null,
      date: '2024-09-01',
      result: 'pass',
      source: 'external',
      eventId: null,
      recordedByUserId: 'u-1',
      examinerName: null,
      organisationName: null,
      notes: null,
      verified: false,
      verifiedByUserId: null,
      verifiedAt: null,
      createdAt: '2026-05-25T08:00:00.000Z',
      updatedAt: null,
      updatedByUserId: null,
    }),
    updateRankHistory: vi.fn().mockResolvedValue({
      id: 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a',
      userId: 'u-1',
      rankId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      shogoTitle: null,
      date: '2024-09-01',
      result: 'pass',
      source: 'external',
      eventId: null,
      recordedByUserId: 'u-1',
      examinerName: null,
      organisationName: null,
      notes: 'fixed',
      verified: false,
      verifiedByUserId: null,
      verifiedAt: null,
      createdAt: '2026-05-25T08:00:00.000Z',
      updatedAt: '2026-05-25T09:00:00.000Z',
      updatedByUserId: 'u-1',
    }),
  };
});

const RANK_SHODAN_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

const VERIFIED_ROW: GradingHistoryRow = {
  id: 'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8a9b',
  source: 'external',
  userId: 'u-1',
  rankId: RANK_SHODAN_ID,
  shogoTitle: null,
  date: '2024-09-01',
  result: 'pass',
  notes: 'orig notes',
  examiner: 'Sensei Tanaka',
  organisationName: 'Kobe Dojo',
  verified: true,
  verifiedBy: { id: 'u-sys', name: 'Admin' },
  verifiedAt: '2026-05-25T08:00:00.000Z',
  canVerify: true,
  canEdit: true,
  updatedAt: null,
  updatedByUserId: null,
};

function renderDialog(
  props: Partial<React.ComponentProps<typeof RankHistoryFormDialog>> = {},
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <RankHistoryFormDialog
          mode={props.mode ?? 'create'}
          open
          onOpenChange={onOpenChange}
          subjectUserId={props.subjectUserId ?? 'u-1'}
          {...(props.entry !== undefined ? { entry: props.entry } : {})}
        />
      </I18nextProvider>
    </QueryClientProvider>,
  );
  return { onOpenChange, user: userEvent.setup() };
}

describe('<RankHistoryFormDialog>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('opens in create mode with empty rank/date inputs', async () => {
    renderDialog({ mode: 'create' });
    expect(await screen.findByLabelText(/date/i)).toHaveValue('');
  });

  it('opens in edit mode with seeded values', async () => {
    renderDialog({ mode: 'edit', entry: VERIFIED_ROW });
    expect(await screen.findByLabelText(/date/i)).toHaveValue('2024-09-01');
    expect(screen.getByLabelText(/notes/i)).toHaveValue('orig notes');
  });

  it('does not show the amber warning when only notes are dirty on a verified row', async () => {
    const { user } = renderDialog({ mode: 'edit', entry: VERIFIED_ROW });
    const notes = await screen.findByLabelText(/notes/i);
    await user.clear(notes);
    await user.type(notes, 'updated notes');
    expect(screen.queryByText(/clears the verification/i)).not.toBeInTheDocument();
  });

  it('shows the amber warning when date is changed on a verified row', async () => {
    const { user } = renderDialog({ mode: 'edit', entry: VERIFIED_ROW });
    const date = await screen.findByLabelText(/date/i);
    await user.clear(date);
    await user.type(date, '2024-10-01');
    await waitFor(() =>
      expect(screen.getByText(/will clear the verification by admin/i)).toBeInTheDocument(),
    );
  });

  it('submits a create via the mutation hook', async () => {
    const { user } = renderDialog({ mode: 'create' });
    await user.click(await screen.findByRole('combobox', { name: /rank/i }));
    await user.click(screen.getByRole('option', { name: /shodan/i }));
    const date = screen.getByLabelText(/date/i);
    await user.type(date, '2024-09-01');
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    const { createRankHistory } = await import('@/entities/rank-history/api/rank-history.api.js');
    await waitFor(() =>
      expect(createRankHistory).toHaveBeenCalledWith(
        'u-1',
        expect.objectContaining({ rankId: RANK_SHODAN_ID, date: '2024-09-01' }),
      ),
    );
  });

  it('submits an edit patch via the mutation hook', async () => {
    const { user } = renderDialog({ mode: 'edit', entry: VERIFIED_ROW });
    const notes = await screen.findByLabelText(/notes/i);
    await user.clear(notes);
    await user.type(notes, 'fixed');
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    const { updateRankHistory } = await import('@/entities/rank-history/api/rank-history.api.js');
    await waitFor(() =>
      expect(updateRankHistory).toHaveBeenCalledWith(
        VERIFIED_ROW.id,
        expect.objectContaining({ notes: 'fixed' }),
      ),
    );
  });

  it('surfaces server errors inline', async () => {
    const { updateRankHistory } = await import('@/entities/rank-history/api/rank-history.api.js');
    vi.mocked(updateRankHistory).mockRejectedValueOnce(new Error('boom'));
    const { user } = renderDialog({ mode: 'edit', entry: VERIFIED_ROW });
    const notes = await screen.findByLabelText(/notes/i);
    await user.clear(notes);
    await user.type(notes, 'fixed');
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    expect(await screen.findByText(/boom/i)).toBeInTheDocument();
  });
});
