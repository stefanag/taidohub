import { describe, expect, it } from 'vitest';

import {
  SaveTrainingSessionSchema,
  TrainingGoalSchema,
  TrainingSessionSchema,
} from '../training-log.js';

describe('training log contract', () => {
  it('round-trips its examples', () => {
    const session = TrainingSessionSchema.meta()?.example;
    expect(TrainingSessionSchema.parse(session)).toEqual(session);
    const goal = TrainingGoalSchema.meta()?.example;
    expect(TrainingGoalSchema.parse(goal)).toEqual(goal);
  });

  it('defaults a session to no practised items and caps its length', () => {
    expect(SaveTrainingSessionSchema.parse({ date: '2026-11-26', kind: 'own' }).items).toEqual([]);
    expect(
      SaveTrainingSessionSchema.safeParse({
        date: '2026-11-26',
        kind: 'own',
        durationMinutes: 24 * 60 + 1,
      }).success,
    ).toBe(false);
  });
});
