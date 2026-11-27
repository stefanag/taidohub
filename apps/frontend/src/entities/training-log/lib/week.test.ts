import { describe, expect, it } from 'vitest';

import { countSessionsThisWeek, weekStart } from './week.js';

describe('week helpers', () => {
  it('starts the week on Monday', () => {
    expect(weekStart('2026-11-27')).toBe('2026-11-23'); // Friday
    expect(weekStart('2026-11-23')).toBe('2026-11-23'); // Monday
    expect(weekStart('2026-11-29')).toBe('2026-11-23'); // Sunday
  });

  it('counts this week up to today', () => {
    const sessions = [
      { date: '2026-11-22' },
      { date: '2026-11-23' },
      { date: '2026-11-27' },
      { date: '2026-11-28' },
    ];
    expect(countSessionsThisWeek(sessions, '2026-11-27')).toBe(2);
  });
});
