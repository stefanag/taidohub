import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ListUsersQuery } from '@/entities/user';

import i18n from '@/i18n';

import { UsersFilters } from './UsersFilters.js';

/**
 * `UsersFilters` is a pure-prop widget (value + onChange). The
 * behaviours worth pinning:
 *
 *   - Every change resets `page` to 1 — the admin pagination has to
 *     reset to the first page whenever the filter changes, otherwise
 *     the user could end up on an empty page 7 of a freshly-narrowed
 *     query.
 *   - The role select treats the `__all` sentinel as "undefined"
 *     (no role filter). The undefined-vs-empty-string distinction is
 *     what the `ListUsersQuery` schema cares about; the test pins
 *     that the patched value is exactly `undefined`, not `''`.
 *   - The "Show deactivated" checkbox toggles between `'all'` and
 *     `'false'` — NOT a tri-state, NOT a boolean.
 */

const BASE_VALUE: ListUsersQuery = {
  page: 5,
  perPage: 25,
  deactivated: 'false',
};

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

function renderFilters(value: ListUsersQuery = BASE_VALUE) {
  const onChange = vi.fn<(next: ListUsersQuery) => void>();
  return {
    onChange,
    ...render(
      <I18nextProvider i18n={i18n}>
        <UsersFilters value={value} onChange={onChange} />
      </I18nextProvider>,
    ),
  };
}

describe('<UsersFilters>', () => {
  it('forwards a search-input change with q + page reset to 1', async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters();
    await user.type(screen.getByLabelText(/search by email/i), 'A');
    // userEvent fires a change per keystroke; we asserted on the last call.
    const lastCall = onChange.mock.calls.at(-1);
    expect(lastCall).toBeDefined();
    expect(lastCall![0]).toMatchObject({ q: 'A', page: 1 });
  });

  it('clears q to undefined when the search input is emptied', async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters({ ...BASE_VALUE, q: 'A' });
    await user.clear(screen.getByLabelText(/search by email/i));
    const lastCall = onChange.mock.calls.at(-1);
    expect(lastCall).toBeDefined();
    expect(lastCall![0].q).toBeUndefined();
    expect(lastCall![0].page).toBe(1);
  });

  it('toggles deactivated between "all" and "false" with page reset', () => {
    const { onChange } = renderFilters({ ...BASE_VALUE, deactivated: 'false' });
    const checkbox = screen.getByRole('checkbox');

    // Check the box — should fire onChange with deactivated: 'all'.
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenLastCalledWith({
      ...BASE_VALUE,
      deactivated: 'all',
      page: 1,
    });
  });

  it('toggles deactivated back to "false" when the box is unchecked', () => {
    const { onChange } = renderFilters({ ...BASE_VALUE, deactivated: 'all' });
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenLastCalledWith({
      ...BASE_VALUE,
      deactivated: 'false',
      page: 1,
    });
  });

  it('reflects the existing deactivated value as the checkbox state', () => {
    renderFilters({ ...BASE_VALUE, deactivated: 'all' });
    expect(screen.getByRole('checkbox')).toBeChecked();
  });
});
