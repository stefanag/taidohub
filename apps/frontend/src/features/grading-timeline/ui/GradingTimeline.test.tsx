import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GradingTimeline } from './GradingTimeline.js';

import type { BeltRank } from '@/entities/belt-rank';
import type { ShogoTitle } from '@/entities/shogo-title';
import type { GradingHistoryRow } from '@/entities/rank-history';

import { DEFAULT_FLAGS, FeatureFlagsProvider, type FeatureFlagMap } from '@/shared/lib/feature-flags';
import i18n from '@/i18n';

const RANK: BeltRank = {
  id: 'rank-shodan',
  organisationId: null,
  systemId: 'sys-dan',
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
};

const SHOGO: ShogoTitle = {
  code: 'renshi',
  nameEn: 'Renshi',
  nameSv: 'Renshi',
  nameFi: 'Renshi',
  nameJa: '錬士',
  minRankId: 'rank-yondan',
  sortOrder: 1,
};

const rankMap = new Map<string, BeltRank>([[RANK.id, RANK]]);
const systemCodeMap = new Map<string, string>([[RANK.systemId, 'dan']]);
const shogoTitleMap = new Map<string, ShogoTitle>([[SHOGO.code, SHOGO]]);

const baseRow: GradingHistoryRow = {
  id: '11111111-1111-4111-8111-111111111111',
  source: 'external',
  userId: 'u-1',
  rankId: RANK.id,
  shogoTitle: null,
  date: '2024-09-01',
  result: 'pass',
  notes: 'Great grading.',
  examiner: 'Sensei Tanaka',
  organisationName: 'Kobe Dojo',
  verified: false,
  verifiedBy: null,
  verifiedAt: null,
  canVerify: false,
  canEdit: false,
  updatedAt: null,
  updatedByUserId: null,
};

function renderTimeline(
  entries: GradingHistoryRow[],
  flags: FeatureFlagMap = DEFAULT_FLAGS,
  callbacks: Partial<React.ComponentProps<typeof GradingTimeline>> = {},
) {
  return render(
    <FeatureFlagsProvider flags={flags}>
      <I18nextProvider i18n={i18n}>
        <GradingTimeline
          entries={entries}
          rankMap={rankMap}
          systemCodeMap={systemCodeMap}
          shogoTitleMap={shogoTitleMap}
          {...callbacks}
        />
      </I18nextProvider>
    </FeatureFlagsProvider>,
  );
}

describe('<GradingTimeline>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders an empty-state message when no entries', () => {
    renderTimeline([]);
    expect(screen.getByText(/no entries/i)).toBeInTheDocument();
  });

  it('renders rows with EXTERNAL badge for external rows', () => {
    renderTimeline([baseRow]);
    expect(screen.getByText('Shodan — 1st Dan 初段', { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/external/i)).toBeInTheDocument();
  });

  it('renders a FAILED badge for fail rows', () => {
    renderTimeline([{ ...baseRow, result: 'fail' }]);
    expect(screen.getByText(/failed/i)).toBeInTheDocument();
  });

  it('hides Pending verification badge when flag is off', () => {
    renderTimeline([baseRow]);
    expect(screen.queryByText(/pending verification/i)).not.toBeInTheDocument();
  });

  it('shows Pending verification badge for external unverified rows when flag is on', () => {
    renderTimeline([baseRow], { ...DEFAULT_FLAGS, 'grading-history-verification': true });
    expect(screen.getByText(/pending verification/i)).toBeInTheDocument();
  });

  it('shows Verified shield for verified rows when flag is on', () => {
    renderTimeline(
      [
        {
          ...baseRow,
          verified: true,
          verifiedBy: { id: 'u-sys', name: 'Admin' },
          verifiedAt: '2026-05-25T08:00:00.000Z',
        },
      ],
      { ...DEFAULT_FLAGS, 'grading-history-verification': true },
    );
    expect(screen.getByTitle(/verified by admin/i)).toBeInTheDocument();
  });

  it('hides the Edit button when grading-history flag is off', () => {
    renderTimeline([{ ...baseRow, canEdit: true }]);
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
  });

  it('shows the Edit button when flag is on and canEdit && external', async () => {
    const onEdit = vi.fn();
    renderTimeline([{ ...baseRow, canEdit: true }], { ...DEFAULT_FLAGS, 'grading-history': true }, { onEdit });
    const editBtn = screen.getByRole('button', { name: /edit/i });
    expect(editBtn).toBeInTheDocument();
    await userEvent.click(editBtn);
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: baseRow.id }));
  });

  it('hides Verify/Unverify when verification flag is off', () => {
    renderTimeline([{ ...baseRow, canVerify: true }]);
    expect(screen.queryByRole('button', { name: /verify/i })).not.toBeInTheDocument();
  });

  it('shows Verify when verification flag is on and canVerify && !verified', async () => {
    const onVerify = vi.fn();
    renderTimeline(
      [{ ...baseRow, canVerify: true }],
      { ...DEFAULT_FLAGS, 'grading-history-verification': true },
      { onVerify },
    );
    const verifyBtn = screen.getByRole('button', { name: /^verify$/i });
    await userEvent.click(verifyBtn);
    expect(onVerify).toHaveBeenCalledWith(baseRow.id);
  });

  it('shows Unverify when verification flag is on and canVerify && verified', async () => {
    const onUnverify = vi.fn();
    renderTimeline(
      [
        {
          ...baseRow,
          canVerify: true,
          verified: true,
          verifiedBy: { id: 'u-sys', name: 'Admin' },
          verifiedAt: '2026-05-25T08:00:00.000Z',
        },
      ],
      { ...DEFAULT_FLAGS, 'grading-history-verification': true },
      { onUnverify },
    );
    const unverifyBtn = screen.getByRole('button', { name: /unverify/i });
    await userEvent.click(unverifyBtn);
    expect(onUnverify).toHaveBeenCalledWith(baseRow.id);
  });

  it('renders rows in date-descending order (latest first)', () => {
    const older: GradingHistoryRow = { ...baseRow, id: 'older', date: '2020-01-01' };
    const newer: GradingHistoryRow = { ...baseRow, id: 'newer', date: '2024-09-01' };
    renderTimeline([older, newer]);
    const dateCells = screen.getAllByText(/\d{4}-\d{2}-\d{2}/);
    expect(dateCells[0]?.textContent).toBe('2024-09-01');
    expect(dateCells[1]?.textContent).toBe('2020-01-01');
  });
});
