import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { GradingAgeSetting } from './GradingAgeSetting.js';

import type { Organisation } from '@/entities/organisation';

import i18n from '@/i18n';

const update = vi.hoisted(() => vi.fn());
vi.mock('@/entities/organisation', async (orig) => ({
  ...(await orig<typeof import('@/entities/organisation')>()),
  useUpdateOrganisation: () => ({
    isPending: false,
    mutate: (vars: { id: string; input: unknown }, cb: { onSuccess: () => void }) => {
      update(vars.id, vars.input);
      cb.onSuccess();
    },
  }),
}));

const ORG: Organisation = {
  id: '11111111-1111-4111-8111-111111111111',
  parentId: null,
  type: 'national_federation',
  shortCode: 'STF',
  slug: null,
  country: 'SWE',
  nameEn: 'STF',
  nameSv: 'STF',
  nameFi: 'STF',
  nameJa: null,
  logoUrl: null,
  address: null,
  contactEmail: null,
  headInstructorId: null,
  gradingAgeBasis: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderSetting(org: Organisation) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nextProvider i18n={i18n}>
        <GradingAgeSetting organisation={org} />
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

beforeAll(() => {
  // Radix Select uses pointer capture and scrollIntoView, which jsdom lacks.
  window.Element.prototype.hasPointerCapture = vi.fn() as never;
  window.Element.prototype.releasePointerCapture = vi.fn() as never;
  window.Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(async () => {
  await i18n.changeLanguage('en');
  update.mockReset().mockResolvedValue({ ...ORG, gradingAgeBasis: 'age_reached_in_grading_year' });
});

describe('<GradingAgeSetting>', () => {
  it('renders nothing for a club', () => {
    expect(renderSetting({ ...ORG, type: 'club' }).container).toBeEmptyDOMElement();
  });

  it('defaults to the age on the grading date and saves a change', async () => {
    renderSetting(ORG);
    const user = userEvent.setup();
    expect(screen.getByRole('combobox')).toHaveTextContent('Age on the day of the grading');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    await user.click(screen.getByRole('combobox'));
    await user.click(
      await screen.findByRole('option', { name: 'Age reached during the grading year' }),
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(ORG.id, {
        gradingAgeBasis: 'age_reached_in_grading_year',
      }),
    );
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
  });
});
