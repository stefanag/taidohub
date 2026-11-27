/** Monday of the ISO week containing `isoDate` (YYYY-MM-DD). */
export function weekStart(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

/** Sessions dated from this week's Monday up to and including `today`. */
export function countSessionsThisWeek(sessions: { date: string }[], today: string): number {
  const from = weekStart(today);
  return sessions.filter((s) => s.date >= from && s.date <= today).length;
}
