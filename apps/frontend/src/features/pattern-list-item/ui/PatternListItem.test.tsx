import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Pattern } from '@repo/contracts/patterns';

import i18n from '@/i18n';

import { PatternListItem } from './PatternListItem.js';

/**
 * Mirror of `TechniqueListItem.test.tsx`. Same behaviours pinned:
 * action-button gating, stop-propagation on action clicks,
 * isDeleting disable state, localised name + JA rendering. One
 * extra: when the localised name equals the romaji name, the
 * secondary line should NOT render a duplicate — pinned via the
 * `showLocalised` check inside the component.
 */

const PATTERN: Pattern = {
  id: 'pattern-1',
  isActive: true,
  sortOrder: 0,
  nameJa: '法形',
  nameRomaji: 'Hokei',
  nameSv: 'Hokei SV',
  nameEn: 'Hokei EN',
  nameFi: 'Hokei FI',
  descriptionSv: '',
  descriptionEn: '',
  descriptionFi: '',
  minRankId: null,
  officialBodyOrgId: null,
  classificationsByRoot: {
    pattern_type: [],
    hokei_subtype: [],
  },
  createdByOrganisationId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as unknown as Pattern;

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

function renderItem(propsOverride: Partial<React.ComponentProps<typeof PatternListItem>> = {}) {
  const onClick = vi.fn();
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  return {
    onClick,
    onEdit,
    onDelete,
    ...render(
      <I18nextProvider i18n={i18n}>
        <ul>
          <PatternListItem
            pattern={PATTERN}
            onClick={onClick}
            onEdit={onEdit}
            onDelete={onDelete}
            {...propsOverride}
          />
        </ul>
      </I18nextProvider>,
    ),
  };
}

describe('<PatternListItem>', () => {
  it('renders the romaji name as the primary heading', () => {
    renderItem();
    expect(screen.getByText('Hokei')).toBeInTheDocument();
  });

  it('renders the localised English name when it differs from the romaji', () => {
    renderItem();
    expect(screen.getByText('Hokei EN')).toBeInTheDocument();
  });

  it('renders the Japanese characters with lang="ja"', () => {
    renderItem();
    const ja = screen.getByText('法形');
    expect(ja).toBeInTheDocument();
    expect(ja).toHaveAttribute('lang', 'ja');
  });

  it('omits the secondary-line localised name when it equals the romaji', () => {
    renderItem({
      pattern: { ...PATTERN, nameEn: 'Hokei', nameJa: null } as unknown as Pattern,
    });
    // The component's `showLocalised` is false when the resolved
    // name === nameRomaji. With no JA either, the whole secondary
    // line shouldn't render — only the romaji "Hokei" appears.
    const allHokei = screen.getAllByText('Hokei');
    expect(allHokei).toHaveLength(1);
  });

  it('hides the Edit + Delete buttons when their callbacks are omitted', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <ul>
          <PatternListItem pattern={PATTERN} />
        </ul>
      </I18nextProvider>,
    );
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('fires onClick(pattern) when the row is clicked', async () => {
    const user = userEvent.setup();
    const { onClick } = renderItem();
    await user.click(screen.getByText('Hokei'));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith(PATTERN);
  });

  it('Edit click fires onEdit(pattern) without bubbling to onClick', async () => {
    const user = userEvent.setup();
    const { onClick, onEdit } = renderItem();
    await user.click(screen.getByRole('button', { name: /edit/i }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith(PATTERN);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('Delete click fires onDelete(pattern) without bubbling to onClick', async () => {
    const user = userEvent.setup();
    const { onClick, onDelete } = renderItem();
    await user.click(screen.getByRole('button', { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith(PATTERN);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('disables the Delete button while isDeleting={true}', () => {
    renderItem({ isDeleting: true });
    expect(screen.getByRole('button', { name: /delete/i })).toBeDisabled();
  });
});
