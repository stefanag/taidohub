import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { listBeltRanksQueryOptions } from '@/entities/belt-rank';
import { usePatternsQuery } from '@/entities/pattern';
import { useTechniquesQuery } from '@/entities/technique';
import { useAccountExportQuery } from '@/features/export-own-data';
import { formatIsoDate } from '@/shared/lib/grading-readiness';
import { rankLabel } from '@/shared/lib/rank-label';
import { Button } from '@/shared/ui';

/**
 * A printable summary of the user's own grading history and training log,
 * from the same export as the JSON download. "Print" uses the browser's
 * print dialog, which can save as PDF: no PDF library involved.
 */
export function MyDataPage(): React.ReactElement {
  const { t, i18n } = useTranslation();
  const data = useAccountExportQuery();
  const ranks = useQuery(listBeltRanksQueryOptions());
  const techniques = useTechniquesQuery();
  const patterns = usePatternsQuery();

  const names = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const x of techniques.data ?? []) m.set(x.id, x.nameRomaji);
    for (const x of patterns.data ?? []) m.set(x.id, x.nameRomaji);
    return m;
  }, [techniques.data, patterns.data]);
  const rankName = (id: string) => {
    const rank = ranks.data?.find((r) => r.id === id);
    return rank ? rankLabel(rank, i18n.language) : id;
  };
  const date = (iso: string) => formatIsoDate(iso.slice(0, 10), i18n.language);

  if (data.isPending)
    return <main className="p-8 text-on-surface-variant">{t('common.loading')}</main>;
  if (data.isError) {
    return (
      <main className="p-8">
        <p role="alert" className="text-sm text-destructive">
          {t('common.unknownError')}
        </p>
      </main>
    );
  }
  const d = data.data;
  const history = [...d.gradingHistory].sort((a, b) => b.date.localeCompare(a.date));
  const cell = 'border-b border-outline-variant/40 px-2 py-1 text-left align-top';

  return (
    <main className="mx-auto max-w-[900px] space-y-8 p-8 print:max-w-none print:p-0">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-headline text-3xl font-extrabold tracking-tight text-primary">
            {t('myData.title')}
          </h1>
          <p className="text-sm text-on-surface-variant">
            {d.account.name ? `${d.account.name} · ` : ''}
            {d.account.email} · {t('myData.exportedAt', { date: date(d.exportedAt) })}
          </p>
        </div>
        <Button variant="outline" className="print:hidden" onClick={() => window.print()}>
          <Printer aria-hidden />
          {t('myData.print')}
        </Button>
      </header>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t('myData.gradingHistory')}</h2>
        {history.length === 0 ? (
          <p className="text-sm text-on-surface-variant">{t('myData.noGradings')}</p>
        ) : (
          <table className="w-full border-collapse text-sm" data-testid="my-data-gradings">
            <thead>
              <tr>
                <th className={cell}>{t('myData.date')}</th>
                <th className={cell}>{t('myData.rank')}</th>
                <th className={cell}>{t('myData.result')}</th>
                <th className={cell}>{t('myData.status')}</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td className={cell}>{date(h.date)}</td>
                  <td className={cell}>
                    {rankName(h.rankId)}
                    {h.organisationName ? (
                      <span className="text-on-surface-variant"> · {h.organisationName}</span>
                    ) : null}
                  </td>
                  <td className={cell}>{t(`myData.results.${h.result}`)}</td>
                  <td className={cell}>
                    {h.verified ? t('myData.verified') : t('myData.selfReported')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t('myData.trainingLog')}</h2>
        {d.trainingSessions.length === 0 ? (
          <p className="text-sm text-on-surface-variant">{t('myData.noSessions')}</p>
        ) : (
          <table className="w-full border-collapse text-sm" data-testid="my-data-sessions">
            <thead>
              <tr>
                <th className={cell}>{t('myData.date')}</th>
                <th className={cell}>{t('trainingLog.form.kind')}</th>
                <th className={cell}>{t('trainingLog.form.duration')}</th>
                <th className={cell}>{t('trainingLog.form.items')}</th>
                <th className={cell}>{t('trainingLog.form.notes')}</th>
              </tr>
            </thead>
            <tbody>
              {d.trainingSessions.map((s) => (
                <tr key={s.id}>
                  <td className={cell}>{date(s.date)}</td>
                  <td className={cell}>{t(`trainingLog.kind.${s.kind}`)}</td>
                  <td className={cell}>{s.durationMinutes ?? ''}</td>
                  <td className={cell}>
                    {s.items
                      .map((i) => names.get(i.contentId) ?? t('trainingLog.removedItem'))
                      .join(', ')}
                  </td>
                  <td className={`${cell} whitespace-pre-wrap`}>{s.notes ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
