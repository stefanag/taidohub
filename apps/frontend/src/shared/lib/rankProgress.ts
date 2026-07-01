import type { GradingRequirements, Progress } from '@repo/contracts';

export function calculateRankProgress(
  req: GradingRequirements,
  techProgress: Progress[],
  patProgress: Progress[],
): { ready: number; total: number; pct: number } {
  const allPatternIds = [
    ...req.hokeiGroups.flatMap((g) => g.patternIds),
    ...req.kobo,
    ...req.otherPatterns,
  ];
  const total = req.kihon.length + allPatternIds.length;
  if (total === 0) return { ready: 0, total: 0, pct: 0 };

  const techReady = new Set(
    techProgress.filter((p) => p.status === 'grading_ready').map((p) => p.techniqueId).filter(Boolean) as string[],
  );
  const patReady = new Set(
    patProgress.filter((p) => p.status === 'grading_ready').map((p) => p.patternId).filter(Boolean) as string[],
  );

  let ready = 0;
  for (const id of req.kihon) if (techReady.has(id)) ready++;
  for (const id of allPatternIds) if (patReady.has(id)) ready++;
  return { ready, total, pct: Math.round((ready / total) * 100) };
}
