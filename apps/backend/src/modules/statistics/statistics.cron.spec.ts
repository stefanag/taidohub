import { describe, expect, it, vi } from 'vitest';
import { StatisticsCronService } from './statistics.cron.js';

describe('StatisticsCronService.runNightly', () => {
  it('calls repo methods in the documented order', async () => {
    const calls: string[] = [];
    const repo = {
      refreshActivityStats: vi.fn(() => { calls.push('activity'); }),
      recomputeAvgGapPerRank: vi.fn(() => { calls.push('avgGap'); }),
      captureMonthlyIfNewMonth: vi.fn(async () => { calls.push('snapshot'); return { captured: false }; }),
      rebuildAll: vi.fn(() => { calls.push('rebuild'); return { durationMs: 1 }; }),
    };
    const svc = new StatisticsCronService(repo as never);
    await svc.runNightly();
    expect(calls).toEqual(['rebuild', 'activity', 'avgGap', 'snapshot']);
  });

  it('logs the rebuildAll durationMs', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const repo = {
      refreshActivityStats: vi.fn(),
      recomputeAvgGapPerRank: vi.fn(),
      captureMonthlyIfNewMonth: vi.fn(async () => ({ captured: false })),
      rebuildAll: vi.fn(async () => ({ durationMs: 4321 })),
    };
    const svc = new StatisticsCronService(repo as never);
    await svc.runNightly();
    expect(logSpy.mock.calls.some((c) => String(c[0]).includes('4321'))).toBe(true);
    logSpy.mockRestore();
  });
});
