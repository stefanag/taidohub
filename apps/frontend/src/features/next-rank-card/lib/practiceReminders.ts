import type { GradingRequirements, Progress } from '@repo/contracts';

export interface PracticeReminder {
  id: string;
  contentType: 'technique' | 'pattern';
  name: string;
  /** YYYY-MM-DD, or null when never practised. */
  lastPracticedAt: string | null;
}

/**
 * Next-rank requirements due for practice: "last practised" unset or more
 * than `thresholdDays` before `today`. Never-practised first, then oldest.
 * Items missing from the catalogue (`names`) are skipped.
 */
export function practiceReminders(input: {
  requirements: GradingRequirements;
  progress: Progress[];
  names: Map<string, string>;
  today: string;
  thresholdDays: number;
}): PracticeReminder[] {
  const { requirements: req, progress, names, today, thresholdDays } = input;
  const cutoff = new Date(Date.parse(`${today}T00:00:00Z`) - thresholdDays * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const last = new Map<string, string | null>();
  for (const p of progress) {
    const id = p.techniqueId ?? p.patternId;
    if (id) last.set(id, p.lastPracticedAt);
  }

  const items: { id: string; contentType: 'technique' | 'pattern' }[] = [
    ...req.kihon.map((id) => ({ id, contentType: 'technique' as const })),
    ...[...req.hokeiGroups.flatMap((g) => g.patternIds), ...req.kobo, ...req.otherPatterns].map(
      (id) => ({
        id,
        contentType: 'pattern' as const,
      }),
    ),
  ];

  const seen = new Set<string>();
  const due: PracticeReminder[] = [];
  for (const item of items) {
    const name = names.get(item.id);
    if (!name || seen.has(item.id)) continue;
    seen.add(item.id);
    const lastPracticedAt = last.get(item.id) ?? null;
    if (lastPracticedAt === null || lastPracticedAt < cutoff)
      due.push({ ...item, name, lastPracticedAt });
  }
  return due.sort((a, b) => (a.lastPracticedAt ?? '').localeCompare(b.lastPracticedAt ?? ''));
}
