import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RankBreakdown } from './RankBreakdown.js';

import type { StatsRankRow } from '@repo/contracts/statistics';

import i18n from '@/i18n';


function row(overrides: Partial<StatsRankRow['rank']> & { count: number }): StatsRankRow {
  const { count, ...rank } = overrides;
  return {
    rank: {
      id: rank.id ?? 'rank-id',
      nameRomaji: rank.nameRomaji ?? 'Romaji',
      nameEn: rank.nameEn ?? 'English',
      nameSv: rank.nameSv ?? 'Svenska',
      nameFi: rank.nameFi ?? 'Suomi',
      sortOrder: rank.sortOrder ?? 0,
    },
    count,
  };
}

describe('<RankBreakdown>', () => {
  it('shows the rank name in the UI language', async () => {
    await i18n.changeLanguage('sv');
    try {
      render(
        <RankBreakdown
          ranks={[row({ id: 'r1', nameRomaji: 'Nikyu', nameEn: '2nd Kyu', nameSv: '2 Kyu', sortOrder: 1, count: 1 })]}
        />,
      );
      expect(screen.getByText('2 Kyu')).toBeInTheDocument();
      expect(screen.queryByText('2nd Kyu')).not.toBeInTheDocument();
    } finally {
      await i18n.changeLanguage('en');
    }
  });

  it('renders rows sorted by rank.sortOrder ascending regardless of input order', () => {
    const ranks: StatsRankRow[] = [
      row({ id: 'r3', nameRomaji: 'Sandan', nameEn: '3rd Dan', sortOrder: 30, count: 3 }),
      row({ id: 'r1', nameRomaji: 'Shodan', nameEn: '1st Dan', sortOrder: 10, count: 1 }),
      row({ id: 'r2', nameRomaji: 'Nidan', nameEn: '2nd Dan', sortOrder: 20, count: 2 }),
    ];
    render(<RankBreakdown ranks={ranks} />);

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Shodan');
    expect(items[1]).toHaveTextContent('Nidan');
    expect(items[2]).toHaveTextContent('Sandan');
  });

  it('renders every rank name (romaji + english) and count', () => {
    const ranks: StatsRankRow[] = [
      row({ id: 'r1', nameRomaji: 'Shodan', nameEn: '1st Dan', sortOrder: 10, count: 5 }),
    ];
    render(<RankBreakdown ranks={ranks} />);

    expect(screen.getByText('Shodan')).toBeInTheDocument();
    expect(screen.getByText('1st Dan')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('still renders zero-count rows', () => {
    const ranks: StatsRankRow[] = [
      row({ id: 'r1', nameRomaji: 'Shodan', nameEn: '1st Dan', sortOrder: 10, count: 0 }),
    ];
    render(<RankBreakdown ranks={ranks} />);

    expect(screen.getByText('Shodan')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});
