import { describe, expect, it } from 'vitest';

import { practiceReminders } from './practiceReminders.js';

import type { GradingRequirements } from '@repo/contracts/grading-requirements';
import type { Progress } from '@repo/contracts/progress';

const REQ = {
  rankId: 'r',
  setId: null,
  hokeiGroups: [{ id: 'g', pickCount: 1, patternIds: ['p-1', 'p-2'] }],
  kobo: ['p-1'],
  koboTested: [],
  otherPatterns: [],
  otherPatternsTested: [],
  kihon: ['t-1', 't-gone'],
  kihonTested: [],
  jissenMinutes: null,
  jissenTested: false,
  minMonthsSincePreviousRank: null,
  requiresTheoricExam: false,
  requiresEssay: false,
} as unknown as GradingRequirements;

const progress = (id: string, type: 'technique' | 'pattern', lastPracticedAt: string | null) =>
  ({
    techniqueId: type === 'technique' ? id : null,
    patternId: type === 'pattern' ? id : null,
    lastPracticedAt,
  }) as Progress;

describe('practiceReminders', () => {
  it('lists never-practised first, then the oldest, skipping recent and unknown items', () => {
    const due = practiceReminders({
      requirements: REQ,
      progress: [
        progress('t-1', 'technique', '2026-09-01'),
        progress('p-1', 'pattern', '2026-11-20'),
      ],
      names: new Map([
        ['t-1', 'Tsuki'],
        ['p-1', 'Sen-un'],
        ['p-2', 'Hen-un'],
      ]),
      today: '2026-11-27',
      thresholdDays: 28,
    });
    expect(due.map((d) => [d.name, d.lastPracticedAt])).toEqual([
      ['Hen-un', null],
      ['Tsuki', '2026-09-01'],
    ]);
  });
});
