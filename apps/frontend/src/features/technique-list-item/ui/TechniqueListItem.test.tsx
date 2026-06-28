import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Technique } from '@repo/contracts/techniques';

import i18n from '@/i18n';

import { TechniqueListItem } from './TechniqueListItem.js';

/**
 * `TechniqueListItem` is a pure-prop row component — no hooks, no
 * queries, no shared context beyond i18n. The behaviours worth
 * pinning are the action-button visibility gates (Edit + Delete
 * each rendered only when their callback is supplied), the
 * stop-propagation on those buttons (clicking the action must not
 * ALSO fire the row click), and the `isDeleting` disable state.
 * The read-only branch (no callbacks) is the public-rank surface
 * use case.
 */

const TECHNIQUE: Technique = {
  id: 'tech-1',
  isKihon: false,
  isActive: true,
  sortOrder: 0,
  nameJa: '突き',
  nameRomaji: 'Tsuki',
  nameSv: 'Tsuki SV',
  nameEn: 'Tsuki EN',
  nameFi: 'Tsuki FI',
  descriptionSv: '',
  descriptionEn: '',
  descriptionFi: '',
  minRankId: null,
  classificationsByRoot: {
    technique_type: [],
    sotai_category: [],
    attack_type: [],
  },
  createdByOrganisationId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as unknown as Technique;

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

function renderItem(propsOverride: Partial<React.ComponentProps<typeof TechniqueListItem>> = {}) {
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
          <TechniqueListItem
            technique={TECHNIQUE}
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

describe('<TechniqueListItem>', () => {
  it('renders the romaji name as the primary heading + the localised English name', () => {
    renderItem();
    expect(screen.getByText('Tsuki')).toBeInTheDocument();
    expect(screen.getByText('Tsuki EN')).toBeInTheDocument();
  });

  it('renders the Japanese characters with lang="ja"', () => {
    renderItem();
    const ja = screen.getByText('突き');
    expect(ja).toBeInTheDocument();
    expect(ja).toHaveAttribute('lang', 'ja');
  });

  it('hides the Edit + Delete buttons when their callbacks are omitted', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <ul>
          <TechniqueListItem technique={TECHNIQUE} />
        </ul>
      </I18nextProvider>,
    );
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('fires onClick(technique) when the row is clicked', async () => {
    const user = userEvent.setup();
    const { onClick } = renderItem();
    await user.click(screen.getByText('Tsuki'));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith(TECHNIQUE);
  });

  it('Edit click fires onEdit(technique) without bubbling to onClick', async () => {
    const user = userEvent.setup();
    const { onClick, onEdit } = renderItem();
    await user.click(screen.getByRole('button', { name: /edit/i }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith(TECHNIQUE);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('Delete click fires onDelete(technique) without bubbling to onClick', async () => {
    const user = userEvent.setup();
    const { onClick, onDelete } = renderItem();
    await user.click(screen.getByRole('button', { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith(TECHNIQUE);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('disables the Delete button while isDeleting={true}', () => {
    renderItem({ isDeleting: true });
    expect(screen.getByRole('button', { name: /delete/i })).toBeDisabled();
  });
});
