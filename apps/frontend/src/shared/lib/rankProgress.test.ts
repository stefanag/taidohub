import { describe, expect, it } from 'vitest';
import type { GradingRequirements, Progress } from '@repo/contracts';
import { calculateRankProgress } from './rankProgress.js';

const empty: GradingRequirements = {
  rankId: 'r', setId: null,
  kihon: [], kihonTested: [], kobo: [], koboTested: [],
  otherPatterns: [], otherPatternsTested: [], hokeiGroups: [],
  jissenMinutes: null, jissenTested: false,
  minMonthsSincePreviousRank: null,
  requiresTheoricExam: false, requiresEssay: false,
};

describe('calculateRankProgress', () => {
  it('returns 0/0 0% when there are no requirements', () => {
    expect(calculateRankProgress(empty, [], [])).toEqual({ ready: 0, total: 0, pct: 0 });
  });

  it('counts kihon techniques toward total', () => {
    expect(calculateRankProgress({ ...empty, kihon: ['t1', 't2'] }, [], [])).toEqual({ ready: 0, total: 2, pct: 0 });
  });

  it('counts grading_ready techniques as ready', () => {
    const techProg: Progress[] = [{ contentType: 'technique', techniqueId: 't1', status: 'grading_ready' } as any];
    expect(calculateRankProgress({ ...empty, kihon: ['t1', 't2'] }, techProg, [])).toEqual({ ready: 1, total: 2, pct: 50 });
  });

  it('flattens hokei group patterns into total', () => {
    const r: GradingRequirements = { ...empty, hokeiGroups: [{ id: 'g1', groupOrder: 0, pickCount: 1, isTested: false, patternIds: ['p1', 'p2'] }] as any };
    expect(calculateRankProgress(r, [], [])).toEqual({ ready: 0, total: 2, pct: 0 });
  });

  it('rounds percentage', () => {
    const r: GradingRequirements = { ...empty, kihon: ['t1', 't2', 't3'] };
    const tp: Progress[] = [{ contentType: 'technique', techniqueId: 't1', status: 'grading_ready' } as any];
    expect(calculateRankProgress(r, tp, []).pct).toBe(33);
  });
});
