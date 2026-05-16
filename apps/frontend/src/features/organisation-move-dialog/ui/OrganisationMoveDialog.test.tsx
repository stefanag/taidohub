import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Organisation } from '@/entities/organisation';
import i18n from '@/i18n';

import { OrganisationMoveDialog } from './OrganisationMoveDialog.js';

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

const CANDIDATE_A: Organisation = ORG({
  id: '11111111-1111-4111-8111-111111111111',
  shortCode: 'NFA',
  type: 'national_federation',
  nameEn: 'National Fed A',
});

const CANDIDATE_B: Organisation = ORG({
  id: '22222222-2222-4222-8222-222222222222',
  shortCode: 'NFB',
  type: 'national_federation',
  nameEn: 'National Fed B',
});

describe('<OrganisationMoveDialog>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders the candidate names passed in', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <OrganisationMoveDialog
          organisation={ORG({ parentId: CANDIDATE_A.id })}
          candidates={[CANDIDATE_A, CANDIDATE_B]}
          open={true}
          onOpenChange={vi.fn()}
          onConfirm={vi.fn().mockResolvedValue(undefined)}
        />
      </I18nextProvider>,
    );

    // The Radix Select renders the currently selected value inside the
    // trigger using SelectValue — for a club the parent is required so the
    // initial selected candidate's label is visible.
    expect(screen.getByText(/National Fed A/)).toBeInTheDocument();
  });

  it('offers the "—" option for international federations and includes candidates', () => {
    // For an international federation, the initial value is __none, so the
    // trigger shows "—".
    render(
      <I18nextProvider i18n={i18n}>
        <OrganisationMoveDialog
          organisation={ORG({ type: 'international_federation', parentId: null })}
          candidates={[CANDIDATE_A]}
          open={true}
          onOpenChange={vi.fn()}
          onConfirm={vi.fn().mockResolvedValue(undefined)}
        />
      </I18nextProvider>,
    );

    // SelectValue renders the selected item text. For an int. fed with
    // parentId = null, that text is the em dash.
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('does NOT offer the "—" option for non-international-federation types', () => {
    // Render a club with parentId set so the trigger shows the candidate label
    // and the "__none" option is never created in the DOM.
    render(
      <I18nextProvider i18n={i18n}>
        <OrganisationMoveDialog
          organisation={ORG({ type: 'club', parentId: CANDIDATE_A.id })}
          candidates={[CANDIDATE_A]}
          open={true}
          onOpenChange={vi.fn()}
          onConfirm={vi.fn().mockResolvedValue(undefined)}
        />
      </I18nextProvider>,
    );

    // No em dash should appear anywhere because allowNoParent is false.
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });

  it('invokes onConfirm with the currently selected parentId when Confirm is clicked', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(
      <I18nextProvider i18n={i18n}>
        <OrganisationMoveDialog
          organisation={ORG({ type: 'club', parentId: CANDIDATE_A.id })}
          candidates={[CANDIDATE_A, CANDIDATE_B]}
          open={true}
          onOpenChange={vi.fn()}
          onConfirm={onConfirm}
        />
      </I18nextProvider>,
    );

    await user.click(screen.getByRole('button', { name: /Confirm/i }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(CANDIDATE_A.id);
  });

  it('invokes onConfirm with null when an international federation has no parent', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(
      <I18nextProvider i18n={i18n}>
        <OrganisationMoveDialog
          organisation={ORG({ type: 'international_federation', parentId: null })}
          candidates={[CANDIDATE_A]}
          open={true}
          onOpenChange={vi.fn()}
          onConfirm={onConfirm}
        />
      </I18nextProvider>,
    );

    await user.click(screen.getByRole('button', { name: /Confirm/i }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(null);
  });

  it('Cancel closes the dialog without calling onConfirm', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(
      <I18nextProvider i18n={i18n}>
        <OrganisationMoveDialog
          organisation={ORG({ parentId: CANDIDATE_A.id })}
          candidates={[CANDIDATE_A]}
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
});
