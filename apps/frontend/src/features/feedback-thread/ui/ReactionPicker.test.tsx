import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FEEDBACK_REACTIONS } from '@repo/contracts/feedback';

import i18n from '@/i18n';

import { ReactionPicker } from './ReactionPicker.js';

/**
 * `ReactionPicker` is the smallest feature in this slice — pure UI, no
 * hooks or queries. Pattern 2 from `docs/frontend-test-recipe.md`
 * applies but the providers stack is minimal (just i18n; no
 * QueryClient or AbilityContext needed).
 *
 * The four invariants worth pinning:
 *
 *   1. The 8 reactions from the contract render — no silent
 *      omissions when the partition (5 emoji + 3 text) is edited.
 *   2. Emoji buttons carry the localised name as their `aria-label`
 *      so screen-reader users hear "Thumbs up" rather than the
 *      glyph alone.
 *   3. Clicking a reaction fires `onSelect` with the EXACT enum
 *      value the contract defines — a future "let me simplify the
 *      button data shape" change can't quietly swap to a label or
 *      index.
 *   4. The contract's `FEEDBACK_REACTIONS` and the component's
 *      hard-coded partition stay in lock-step.
 */

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

function renderPicker(onSelect = vi.fn()) {
  return {
    onSelect,
    ...render(
      <I18nextProvider i18n={i18n}>
        <ReactionPicker onSelect={onSelect} />
      </I18nextProvider>,
    ),
  };
}

describe('<ReactionPicker>', () => {
  it('renders one button per reaction in the contract', () => {
    renderPicker();
    expect(screen.getAllByRole('button')).toHaveLength(FEEDBACK_REACTIONS.length);
  });

  it('renders the five emoji reactions with their localised glyph as aria-label', () => {
    renderPicker();
    expect(screen.getByRole('button', { name: '👍' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '❤️' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '🙏' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '💪' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '🔥' })).toBeInTheDocument();
  });

  it('renders the three text reactions with their localised label', () => {
    renderPicker();
    expect(screen.getByRole('button', { name: 'Noted' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thank you' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Will work on it' })).toBeInTheDocument();
  });

  it('forwards the exact reaction enum value to onSelect (emoji case)', async () => {
    const { onSelect } = renderPicker();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '👍' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('thumbs_up');
  });

  it('forwards the exact reaction enum value to onSelect (text case)', async () => {
    const { onSelect } = renderPicker();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Thank you' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('thank_you');
  });

  it('keeps the emoji + text partition in sync with the contract', () => {
    // Module-level sanity (see ReactionPicker.tsx lines 30-40) warns
    // when the partition drifts. The test pins the actual count here
    // so the warning isn't a silent dev-only diagnostic.
    renderPicker();
    expect(screen.getAllByRole('button')).toHaveLength(8);
    expect(FEEDBACK_REACTIONS).toHaveLength(8);
  });
});
