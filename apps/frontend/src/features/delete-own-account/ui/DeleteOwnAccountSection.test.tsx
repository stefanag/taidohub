import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api/delete-own-account.api.js', () => ({ deleteOwnAccount: vi.fn() }));

import { deleteOwnAccount } from '../api/delete-own-account.api.js';

import { DeleteOwnAccountSection } from './DeleteOwnAccountSection.js';

import i18n from '@/i18n';
import { HttpError } from '@/shared/api';

describe('<DeleteOwnAccountSection>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    vi.mocked(deleteOwnAccount).mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function openAndConfirm(password: string) {
    const user = userEvent.setup();
    render(<DeleteOwnAccountSection />);
    await user.click(screen.getByRole('button', { name: 'Delete my account' }));
    expect(screen.getByRole('button', { name: 'Delete permanently' })).toBeDisabled();
    await user.type(screen.getByLabelText('Password'), password);
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));
  }

  it('deletes the account with the password and leaves the app', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    vi.mocked(deleteOwnAccount).mockResolvedValue();
    await openAndConfirm('my-password');
    expect(deleteOwnAccount).toHaveBeenCalledWith('my-password');
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/'));
  });

  it('says so when the password is wrong', async () => {
    vi.mocked(deleteOwnAccount).mockRejectedValue(
      new HttpError(400, { code: 'INVALID_PASSWORD', message: 'x' }),
    );
    await openAndConfirm('wrong');
    expect(await screen.findByText('The password is not correct.')).toBeInTheDocument();
  });
});
