import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import i18n from '@/i18n';

import { AuditLogFilters } from './AuditLogFilters.js';

describe('<AuditLogFilters>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders the user-id input and clear button', () => {
    render(<AuditLogFilters value={{ page: 1, perPage: 25 }} onChange={vi.fn()} />);

    expect(screen.getByLabelText(/user id/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument();
  });

  it('emits onChange with the new userId + page: 1 on input', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<AuditLogFilters value={{ page: 3, perPage: 25 }} onChange={onChange} />);

    await user.type(screen.getByLabelText(/user id/i), 'u');

    // Last call carries the latest value.
    const lastCall = onChange.mock.calls.at(-1);
    expect(lastCall?.[0]).toMatchObject({ userId: 'u', page: 1 });
  });

  it('clears filters back to page+perPage only', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <AuditLogFilters
        value={{ page: 5, perPage: 25, userId: 'u-1', from: '2026-01-01T00:00:00.000Z' }}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: /clear/i }));

    expect(onChange).toHaveBeenCalledWith({ page: 1, perPage: 25 });
  });
});
