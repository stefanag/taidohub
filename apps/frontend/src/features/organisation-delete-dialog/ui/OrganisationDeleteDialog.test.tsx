import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Organisation } from '@/entities/organisation';
import i18n from '@/i18n';

import { OrganisationDeleteDialog } from './OrganisationDeleteDialog.js';

const ORG = (over: Partial<Organisation> = {}): Organisation => ({
  id: '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5',
  parentId: null,
  type: 'club',
  shortCode: 'STK',
  slug: null,
  country: 'SWE',
  nameEn: 'Stockholm',
  nameSv: 'Stockholm',
  nameFi: 'Tukholma',
  nameJa: null,
  logoUrl: null,
  address: null,
  contactEmail: null,
  headInstructorId: null,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
  ...over,
});

describe('<OrganisationDeleteDialog>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders the Delete button when childCount === 0 and invokes onConfirm', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(
      <I18nextProvider i18n={i18n}>
        <OrganisationDeleteDialog
          organisation={ORG()}
          childCount={0}
          open={true}
          onOpenChange={vi.fn()}
          onConfirm={onConfirm}
        />
      </I18nextProvider>,
    );

    // Two buttons named /Delete/ would be ambiguous if the title also matched —
    // but the title is a heading, not a button. Find the destructive action.
    const deleteButton = screen.getByRole('button', { name: /Delete/i });
    await user.click(deleteButton);

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('does NOT render the Delete button when childCount > 0 and shows the hasChildren message', () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(
      <I18nextProvider i18n={i18n}>
        <OrganisationDeleteDialog
          organisation={ORG()}
          childCount={3}
          open={true}
          onOpenChange={vi.fn()}
          onConfirm={onConfirm}
        />
      </I18nextProvider>,
    );

    // Only the Cancel button should be present — no Delete *button*.
    const buttons = screen.getAllByRole('button');
    const deleteButtons = buttons.filter((b) => /^Delete$/i.test(b.textContent ?? ''));
    expect(deleteButtons).toHaveLength(0);

    // The hasChildren message should mention the child count.
    expect(screen.getByText(/still has 3 child/i)).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('Cancel button always closes the dialog (calls onOpenChange(false))', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(
      <I18nextProvider i18n={i18n}>
        <OrganisationDeleteDialog
          organisation={ORG()}
          childCount={0}
          open={true}
          onOpenChange={onOpenChange}
          onConfirm={onConfirm}
        />
      </I18nextProvider>,
    );

    await user.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('Cancel works even when childCount > 0 (the Delete branch is replaced but Cancel remains)', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <I18nextProvider i18n={i18n}>
        <OrganisationDeleteDialog
          organisation={ORG()}
          childCount={5}
          open={true}
          onOpenChange={onOpenChange}
          onConfirm={vi.fn().mockResolvedValue(undefined)}
        />
      </I18nextProvider>,
    );

    await user.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
