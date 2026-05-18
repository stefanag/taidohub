import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CreateOrganisationInput, Organisation } from '@/entities/organisation';
import i18n from '@/i18n';

import { OrganisationForm } from './OrganisationForm.js';

const PARENT_CANDIDATE: Organisation = {
  id: '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5',
  parentId: null,
  type: 'international_federation',
  shortCode: 'WTF',
  slug: 'world-taido-federation',
  country: null,
  nameEn: 'World Taido Federation',
  nameSv: 'Världstaidoförbundet',
  nameFi: 'Maailman Taidoliitto',
  nameJa: '世界躰道連盟',
  logoUrl: null,
  address: null,
  contactEmail: null,
  headInstructorId: null,
  createdAt: '2025-04-02T08:00:00.000Z',
  updatedAt: '2025-04-02T08:00:00.000Z',
};

const VALID_CREATE: Partial<CreateOrganisationInput> = {
  type: 'club',
  parentId: PARENT_CANDIDATE.id,
  shortCode: 'TKD',
  country: 'SWE',
  nameEn: 'Taido Club',
  nameSv: 'Taidoklubb',
  nameFi: 'Taido-kerho',
};

function renderForm(
  overrides: Partial<React.ComponentProps<typeof OrganisationForm>> = {},
): {
  onSubmit: ReturnType<typeof vi.fn>;
  user: ReturnType<typeof userEvent.setup>;
} {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const user = userEvent.setup();
  render(
    <I18nextProvider i18n={i18n}>
      <OrganisationForm
        mode="create"
        parentCandidates={[PARENT_CANDIDATE]}
        onSubmit={onSubmit}
        {...overrides}
      />
    </I18nextProvider>,
  );
  return { onSubmit, user };
}

describe('<OrganisationForm>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders the create label on the submit button in create mode', () => {
    renderForm();
    expect(screen.getByRole('button', { name: /Create/i })).toBeInTheDocument();
  });

  it('renders the save label and disables the type select in edit mode', () => {
    renderForm({
      mode: 'edit',
      initialValues: VALID_CREATE,
    });

    expect(screen.getByRole('button', { name: /Save/i })).toBeInTheDocument();

    // The shadcn Select trigger is a button with aria-label "Type" and gets
    // a `data-disabled` attribute when disabled.
    const typeTrigger = screen.getByRole('combobox', { name: /Type/i });
    expect(typeTrigger).toBeDisabled();
  });

  it('does not call onSubmit when required fields are empty', async () => {
    const { onSubmit, user } = renderForm();
    // Defaults leave nameEn/nameSv/nameFi/shortCode empty → validation must fail.
    await user.click(screen.getByRole('button', { name: /Create/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    // At least one zod error message should appear.
    const alerts = await screen.findAllByRole('alert');
    expect(alerts.length).toBeGreaterThan(0);
  });

  it('calls onSubmit with the validated payload when all required fields are present', async () => {
    const { onSubmit, user } = renderForm({ initialValues: VALID_CREATE });
    await user.click(screen.getByRole('button', { name: /Create/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0]![0] as CreateOrganisationInput;
    expect(payload).toMatchObject({
      type: 'club',
      shortCode: 'TKD',
      country: 'SWE',
      nameEn: 'Taido Club',
      nameSv: 'Taidoklubb',
      nameFi: 'Taido-kerho',
      parentId: PARENT_CANDIDATE.id,
    });
  });
});
