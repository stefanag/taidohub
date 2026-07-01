import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RankRequirementsEditor } from './RankRequirementsEditor.js';

import type { ClassificationCategory } from '@repo/contracts/classification-category';
import type { GradingRequirements } from '@repo/contracts/grading-requirements';
import type { Pattern } from '@repo/contracts/patterns';
import type { Technique } from '@repo/contracts/techniques';

import i18n from '@/i18n';

const RANK_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const SET_ID = 'aaaaaaaa-0000-4000-8000-000000000002';

const TECH_KIHON_1: Technique = {
  id: '11111111-0000-4000-8000-000000000001',
  createdByOrganisationId: null,
  isKihon: true,
  isActive: true,
  sortOrder: 0,
  minRankId: null,
  nameJa: '',
  nameRomaji: 'Mae geri',
  nameSv: 'Framre spark',
  nameEn: 'Front kick',
  nameFi: 'Etupotku',
  descriptionSv: '',
  descriptionEn: '',
  descriptionFi: '',
  classificationsByRoot: { technique_type: [], sotai_category: [], attack_type: [] },
  classifications: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const TECH_NON_KIHON: Technique = {
  ...TECH_KIHON_1,
  id: '22222222-0000-4000-8000-000000000002',
  isKihon: false,
  nameRomaji: 'Advanced thing',
  nameEn: 'Advanced thing',
};

const KOBO_CATEGORY: ClassificationCategory = {
  id: '33333333-0000-4000-8000-000000000001',
  code: 'kobo',
  nameEn: 'Kobo',
  nameSv: 'Kobo',
  nameFi: 'Kobo',
  nameJa: '',
  rootCode: 'pattern_type',
  parentId: null,
  sortOrder: 0,
  isActive: true,
};

const OTHER_CATEGORY = {
  ...KOBO_CATEGORY,
  id: '44444444-0000-4000-8000-000000000002',
  code: 'kata',
  nameEn: 'Kata',
  nameSv: 'Kata',
  nameFi: 'Kata',
};

function makePattern(overrides: Partial<Pattern>): Pattern {
  return {
    id: '55555555-0000-4000-8000-000000000000',
    createdByOrganisationId: null,
    officialBodyOrgId: null,
    isActive: true,
    sortOrder: 0,
    minRankId: null,
    nameJa: '',
    nameRomaji: 'Sei no hokei',
    nameSv: 'Sei no hokei',
    nameEn: 'Sei no hokei',
    nameFi: 'Sei no hokei',
    descriptionSv: '',
    descriptionEn: '',
    descriptionFi: '',
    classificationsByRoot: { pattern_type: [], hokei_subtype: [] },
    classifications: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const PATTERN_KOBO: Pattern = makePattern({
  id: '66666666-0000-4000-8000-000000000001',
  nameRomaji: 'Kobo pattern one',
  nameEn: 'Kobo pattern one',
  classificationsByRoot: { pattern_type: [KOBO_CATEGORY], hokei_subtype: [] },
});

const PATTERN_OTHER: Pattern = makePattern({
  id: '77777777-0000-4000-8000-000000000002',
  nameRomaji: 'Other pattern one',
  nameEn: 'Other pattern one',
  classificationsByRoot: { pattern_type: [OTHER_CATEGORY], hokei_subtype: [] },
});

const PATTERN_OTHER_2: Pattern = makePattern({
  id: '88888888-0000-4000-8000-000000000003',
  nameRomaji: 'Other pattern two',
  nameEn: 'Other pattern two',
  classificationsByRoot: { pattern_type: [OTHER_CATEGORY], hokei_subtype: [] },
});

const EMPTY_REQUIREMENTS: GradingRequirements = {
  rankId: RANK_ID,
  setId: SET_ID,
  hokeiGroups: [],
  kobo: [],
  koboTested: [],
  otherPatterns: [],
  otherPatternsTested: [],
  kihon: [],
  kihonTested: [],
  jissenMinutes: null,
  jissenTested: false,
  minMonthsSincePreviousRank: null,
  requiresTheoricExam: false,
  requiresEssay: false,
};

const { hooks } = vi.hoisted(() => ({
  hooks: {
    getRequirementsForSet: vi.fn(),
    getTechniques: vi.fn(),
    getPatterns: vi.fn(),
    setRequirements: vi.fn(),
  },
}));

vi.mock('@/entities/rank-requirement/api/rank-requirement.api.js', async (orig) => {
  const actual =
    await orig<typeof import('@/entities/rank-requirement/api/rank-requirement.api.js')>();
  return {
    ...actual,
    getRequirementsForSet: hooks.getRequirementsForSet,
    setRequirements: hooks.setRequirements,
  };
});
vi.mock('@/entities/technique/api/technique.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/technique/api/technique.api.js')>();
  return { ...actual, getTechniques: hooks.getTechniques };
});
vi.mock('@/entities/pattern/api/pattern.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/pattern/api/pattern.api.js')>();
  return { ...actual, getPatterns: hooks.getPatterns };
});


function renderEditor(rankId = RANK_ID, setId = SET_ID) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <RankRequirementsEditor rankId={rankId} setId={setId} />
      </I18nextProvider>
    </QueryClientProvider>,
  );
  return { user: userEvent.setup(), client, ...utils };
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
  hooks.getRequirementsForSet.mockReset().mockResolvedValue(EMPTY_REQUIREMENTS);
  hooks.getTechniques.mockReset().mockResolvedValue([TECH_KIHON_1, TECH_NON_KIHON]);
  hooks.getPatterns
    .mockReset()
    .mockResolvedValue([PATTERN_KOBO, PATTERN_OTHER, PATTERN_OTHER_2]);
  hooks.setRequirements.mockReset().mockResolvedValue(EMPTY_REQUIREMENTS);
});

describe('<RankRequirementsEditor>', () => {
  it('loads initial values from the query and only offers isKihon techniques in the Kihon section', async () => {
    renderEditor();

    await waitFor(() => {
      expect(hooks.getRequirementsForSet).toHaveBeenCalledWith(RANK_ID, SET_ID);
    });

    expect(await screen.findByText('Front kick')).toBeInTheDocument();
    expect(screen.queryByText('Advanced thing')).not.toBeInTheDocument();
  });

  it('splits patterns into Kobo vs Other sections based on classificationsByRoot.pattern_type code', async () => {
    renderEditor();

    // Wait for the patterns query to resolve before asserting section
    // membership — the chips only render once `usePatternsQuery` settles.
    await screen.findByText('Kobo pattern one');
    await screen.findByText('Other pattern one');

    const koboHeading = screen.getByRole('heading', { name: /kobo patterns/i });
    const koboSection = koboHeading.closest('section')!;
    expect(within(koboSection).getByText('Kobo pattern one')).toBeInTheDocument();
    expect(within(koboSection).queryByText('Other pattern one')).not.toBeInTheDocument();

    const otherHeading = screen.getByRole('heading', { name: /other patterns/i });
    const otherSection = otherHeading.closest('section')!;
    expect(within(otherSection).getByText('Other pattern one')).toBeInTheDocument();
    expect(within(otherSection).getByText('Other pattern two')).toBeInTheDocument();
    expect(within(otherSection).queryByText('Kobo pattern one')).not.toBeInTheDocument();
  });

  it('adds a technique to kihonTested when its Tested chip is toggled, and preserves it in kihon', async () => {
    const { user } = renderEditor();

    // Wait for the techniques query to resolve before the chip exists.
    const kihonChip = await screen.findByRole('button', { name: 'Front kick' });
    const kihonSection = kihonChip.closest('section')!;

    // Select the technique first (moves it into the "selected" chip row).
    await user.click(kihonChip);
    // Now toggle its Tested button.
    await user.click(within(kihonSection).getByRole('button', { name: 'Tested' }));

    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(hooks.setRequirements).toHaveBeenCalledTimes(1));
    const [, body] = hooks.setRequirements.mock.calls[0]!;
    expect(body.kihon).toEqual([TECH_KIHON_1.id]);
    expect(body.kihonTested).toEqual([TECH_KIHON_1.id]);
  });

  it('removing a selected technique removes it from both kihon and kihonTested', async () => {
    const { user } = renderEditor();

    const kihonChip = await screen.findByRole('button', { name: 'Front kick' });
    const kihonSection = kihonChip.closest('section')!;

    await user.click(kihonChip);
    await user.click(within(kihonSection).getByRole('button', { name: 'Tested' }));
    // Remove the chip.
    await user.click(within(kihonSection).getByRole('button', { name: /remove front kick/i }));

    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(hooks.setRequirements).toHaveBeenCalledTimes(1));
    const [, body] = hooks.setRequirements.mock.calls[0]!;
    expect(body.kihon).toEqual([]);
    expect(body.kihonTested).toEqual([]);
  });

  it('adding a hokei group with pickCount=5 and 2 patterns sends pickCount 5 unclamped', async () => {
    const { user } = renderEditor();

    await screen.findByText('Front kick');
    await user.click(screen.getByRole('button', { name: /add group/i }));

    const groupCard = screen.getByTestId('hokei-group-0');
    await user.click(within(groupCard).getByRole('button', { name: 'Other pattern one' }));
    await user.click(within(groupCard).getByRole('button', { name: 'Other pattern two' }));

    const pickCountInput = within(groupCard).getByLabelText(/pick count/i);
    await user.clear(pickCountInput);
    await user.type(pickCountInput, '5');

    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(hooks.setRequirements).toHaveBeenCalledTimes(1));
    const [, body] = hooks.setRequirements.mock.calls[0]!;
    expect(body.hokeiGroups).toHaveLength(1);
    expect(body.hokeiGroups[0]).toMatchObject({
      pickCount: 5,
      patternIds: expect.arrayContaining([PATTERN_OTHER.id, PATTERN_OTHER_2.id]),
    });
  });

  it('calls useSetRequirementsMutation with rankId + setId-injected body on Save', async () => {
    const { user } = renderEditor();

    await screen.findByText('Front kick');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(hooks.setRequirements).toHaveBeenCalledTimes(1));
    const [calledRankId, body] = hooks.setRequirements.mock.calls[0]!;
    expect(calledRankId).toBe(RANK_ID);
    expect(body.setId).toBe(SET_ID);
  });
});
