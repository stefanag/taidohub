import { render, screen, within } from '@testing-library/react';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it } from 'vitest';

import { RankRequirementsDisplay } from './RankRequirementsDisplay.js';

import type { GradingRequirements } from '@repo/contracts/grading-requirements';
import type { Pattern } from '@repo/contracts/patterns';
import type { Progress } from '@repo/contracts/progress';
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
  nameJa: '前蹴り',
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

const TECH_KIHON_2: Technique = {
  ...TECH_KIHON_1,
  id: '22222222-0000-4000-8000-000000000002',
  nameJa: '後ろ蹴り',
  nameRomaji: 'Ushiro geri',
  nameEn: 'Back kick',
};

function makePattern(overrides: Partial<Pattern>): Pattern {
  return {
    id: '55555555-0000-4000-8000-000000000000',
    createdByOrganisationId: null,
    officialBodyOrgId: null,
    isActive: true,
    sortOrder: 0,
    minRankId: null,
    nameJa: '整の型',
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
});

const PATTERN_OTHER: Pattern = makePattern({
  id: '77777777-0000-4000-8000-000000000002',
  nameRomaji: 'Other pattern one',
  nameEn: 'Other pattern one',
});

const PATTERN_HOKEI_1: Pattern = makePattern({
  id: '88888888-0000-4000-8000-000000000003',
  nameRomaji: 'Hokei pattern one',
  nameEn: 'Hokei pattern one',
});

const PATTERN_HOKEI_2: Pattern = makePattern({
  id: '99999999-0000-4000-8000-000000000004',
  nameRomaji: 'Hokei pattern two',
  nameEn: 'Hokei pattern two',
});

const PATTERN_HOKEI_3: Pattern = makePattern({
  id: '99999999-0000-4000-8000-000000000005',
  nameRomaji: 'Hokei pattern three',
  nameEn: 'Hokei pattern three',
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

function makeProgress(overrides: Partial<Progress>): Progress {
  return {
    id: 'pppppppp-0000-4000-8000-000000000001',
    userId: 'user-1',
    contentType: 'technique',
    techniqueId: null,
    patternId: null,
    status: 'learning',
    studentNotes: '',
    instructorNotes: '',
    lastPracticedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const LOOKUP = {
  techniques: new Map([
    [TECH_KIHON_1.id, TECH_KIHON_1],
    [TECH_KIHON_2.id, TECH_KIHON_2],
  ]),
  patterns: new Map([
    [PATTERN_KOBO.id, PATTERN_KOBO],
    [PATTERN_OTHER.id, PATTERN_OTHER],
    [PATTERN_HOKEI_1.id, PATTERN_HOKEI_1],
    [PATTERN_HOKEI_2.id, PATTERN_HOKEI_2],
    [PATTERN_HOKEI_3.id, PATTERN_HOKEI_3],
  ]),
};

function renderDisplay(
  requirements: GradingRequirements,
  techProgress: Progress[] = [],
  patProgress: Progress[] = [],
) {
  return render(
    <I18nextProvider i18n={i18n}>
      <RankRequirementsDisplay
        requirements={requirements}
        techProgress={techProgress}
        patProgress={patProgress}
        lookup={LOOKUP}
      />
    </I18nextProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

describe('<RankRequirementsDisplay>', () => {
  it('renders each section only when non-empty', () => {
    renderDisplay({
      ...EMPTY_REQUIREMENTS,
      kihon: [TECH_KIHON_1.id],
    });

    expect(screen.getByRole('heading', { name: /kihon/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^kobo$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /other patterns/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /hokei groups/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /other requirements/i })).not.toBeInTheDocument();
  });

  it('renders all five sections when all are populated', () => {
    renderDisplay({
      ...EMPTY_REQUIREMENTS,
      kihon: [TECH_KIHON_1.id],
      kobo: [PATTERN_KOBO.id],
      otherPatterns: [PATTERN_OTHER.id],
      hokeiGroups: [
        {
          id: 'gggggggg-0000-4000-8000-000000000001',
          groupOrder: 0,
          pickCount: 1,
          isTested: false,
          labelEn: 'Group 0',
          labelFi: null,
          labelSv: null,
          patternIds: [PATTERN_HOKEI_1.id, PATTERN_HOKEI_2.id],
        },
      ],
      jissenMinutes: 10,
      requiresEssay: true,
    });

    expect(screen.getByRole('heading', { name: /kihon/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^kobo$/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /other patterns/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /hokei groups/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /other requirements/i })).toBeInTheDocument();
  });

  it('renders the "Tested" chip on tested items only', () => {
    renderDisplay({
      ...EMPTY_REQUIREMENTS,
      kihon: [TECH_KIHON_1.id, TECH_KIHON_2.id],
      kihonTested: [TECH_KIHON_1.id],
    });

    const heading = screen.getByRole('heading', { name: /kihon/i });
    const section = heading.closest('section')!;
    const items = within(section).getAllByRole('listitem');

    const testedItem = items.find((li) => within(li).queryByText('Mae geri'))!;
    const untestedItem = items.find((li) => within(li).queryByText('Ushiro geri'))!;

    expect(within(testedItem).getByText('Tested')).toBeInTheDocument();
    expect(within(untestedItem).queryByText('Tested')).not.toBeInTheDocument();
  });

  it('renders the "Mastered" indicator when progress status is grading_ready', () => {
    renderDisplay(
      {
        ...EMPTY_REQUIREMENTS,
        kihon: [TECH_KIHON_1.id, TECH_KIHON_2.id],
      },
      [
        makeProgress({ techniqueId: TECH_KIHON_1.id, status: 'grading_ready' }),
        makeProgress({ techniqueId: TECH_KIHON_2.id, status: 'learning' }),
      ],
    );

    const heading = screen.getByRole('heading', { name: /kihon/i });
    const section = heading.closest('section')!;
    const items = within(section).getAllByRole('listitem');

    const masteredItem = items.find((li) => within(li).queryByText('Mae geri'))!;
    const notMasteredItem = items.find((li) => within(li).queryByText('Ushiro geri'))!;

    expect(within(masteredItem).getByText('Mastered')).toBeInTheDocument();
    expect(within(notMasteredItem).queryByText('Mastered')).not.toBeInTheDocument();
  });

  it('shows "Pick N of M" caption when pickCount < patternIds.length', () => {
    renderDisplay({
      ...EMPTY_REQUIREMENTS,
      hokeiGroups: [
        {
          id: 'gggggggg-0000-4000-8000-000000000001',
          groupOrder: 0,
          pickCount: 2,
          isTested: false,
          labelEn: null,
          labelFi: null,
          labelSv: null,
          patternIds: [PATTERN_HOKEI_1.id, PATTERN_HOKEI_2.id, PATTERN_HOKEI_3.id],
        },
      ],
    });

    expect(screen.getByText('Pick 2 of 3')).toBeInTheDocument();
    expect(screen.queryByText('All required')).not.toBeInTheDocument();
  });

  it('shows "All required" caption when pickCount === patternIds.length', () => {
    renderDisplay({
      ...EMPTY_REQUIREMENTS,
      hokeiGroups: [
        {
          id: 'gggggggg-0000-4000-8000-000000000002',
          groupOrder: 0,
          pickCount: 2,
          isTested: false,
          labelEn: null,
          labelFi: null,
          labelSv: null,
          patternIds: [PATTERN_HOKEI_1.id, PATTERN_HOKEI_2.id],
        },
      ],
    });

    expect(screen.getByText('All required')).toBeInTheDocument();
    expect(screen.queryByText(/^Pick /)).not.toBeInTheDocument();
  });

  it('shows only truthy scalar fields', () => {
    renderDisplay({
      ...EMPTY_REQUIREMENTS,
      jissenMinutes: 15,
      minMonthsSincePreviousRank: null,
      requiresTheoricExam: false,
      requiresEssay: true,
    });

    expect(screen.getByText('Jissen sparring minutes: 15')).toBeInTheDocument();
    expect(screen.getByText('Essay required')).toBeInTheDocument();
    expect(screen.queryByText(/Minimum months/)).not.toBeInTheDocument();
    expect(screen.queryByText('Theory exam required')).not.toBeInTheDocument();
  });

  it('hides the scalars section entirely when no scalar field is truthy', () => {
    renderDisplay(EMPTY_REQUIREMENTS);

    expect(screen.queryByRole('heading', { name: /other requirements/i })).not.toBeInTheDocument();
  });
});
