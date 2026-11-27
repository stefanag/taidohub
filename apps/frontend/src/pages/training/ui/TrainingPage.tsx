import { Pencil, Plus, Trash2 } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { usePatternsQuery } from '@/entities/pattern';
import { useTechniquesQuery } from '@/entities/technique';
import {
  deleteTrainingSession,
  useTrainingLogMutation,
  useTrainingSessionsQuery,
  type TrainingSession,
} from '@/entities/training-log';
import { TrainingGoalForm } from '@/features/training-goal';
import { TrainingSessionDialog } from '@/features/training-session-form';
import { useFeatureFlag } from '@/shared/lib/feature-flags';
import { formatIsoDate } from '@/shared/lib/grading-readiness';
import { Button, Card, CardContent } from '@/shared/ui';

/**
 * The signed-in user's training log: personal goals at the top, then the
 * sessions, newest first, with log / edit / delete. Behind the training-log
 * flag; with it off the page says so instead of failing on 404s.
 */
export function TrainingPage(): React.ReactElement {
  const { t, i18n } = useTranslation();
  const enabled = useFeatureFlag('training-log');
  const sessions = useTrainingSessionsQuery({}, { enabled });
  const techniques = useTechniquesQuery();
  const patterns = usePatternsQuery();
  const remove = useTrainingLogMutation(deleteTrainingSession);
  const [dialog, setDialog] = React.useState<{
    open: boolean;
    session?: TrainingSession | undefined;
  }>({
    open: false,
  });

  const names = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const x of techniques.data ?? []) m.set(x.id, x.nameRomaji);
    for (const x of patterns.data ?? []) m.set(x.id, x.nameRomaji);
    return m;
  }, [techniques.data, patterns.data]);

  if (!enabled) {
    return (
      <main className="mx-auto max-w-[900px] p-8">
        <p className="text-on-surface-variant">{t('trainingLog.unavailable')}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[900px] space-y-8 p-8">
      <header className="flex items-center justify-between gap-4">
        <h1 className="font-headline text-3xl font-extrabold tracking-tight text-primary">
          {t('trainingLog.title')}
        </h1>
        <Button onClick={() => setDialog({ open: true })}>
          <Plus aria-hidden />
          {t('trainingLog.logSession')}
        </Button>
      </header>

      <TrainingGoalForm />

      <section className="space-y-3" aria-labelledby="training-sessions-heading">
        <h2 id="training-sessions-heading" className="text-lg font-semibold">
          {t('trainingLog.sessions')}
        </h2>
        {sessions.isPending ? (
          <p className="text-on-surface-variant">{t('common.loading')}</p>
        ) : sessions.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {t('common.unknownError')}
          </p>
        ) : sessions.data.length === 0 ? (
          <p className="text-on-surface-variant">{t('trainingLog.empty')}</p>
        ) : (
          <ul className="space-y-2">
            {sessions.data.map((s) => (
              <li key={s.id}>
                <Card data-testid="training-session">
                  <CardContent className="flex items-start justify-between gap-4 p-4">
                    <div className="space-y-1 text-sm">
                      <p className="font-medium">
                        {formatIsoDate(s.date, i18n.language)} · {t(`trainingLog.kind.${s.kind}`)}
                        {s.durationMinutes
                          ? ` · ${t('trainingLog.minutes', { count: s.durationMinutes })}`
                          : ''}
                      </p>
                      {s.items.length > 0 ? (
                        <p className="text-on-surface-variant">
                          {s.items
                            .map((i) => names.get(i.contentId) ?? t('trainingLog.removedItem'))
                            .join(', ')}
                        </p>
                      ) : null}
                      {s.notes ? <p className="whitespace-pre-wrap">{s.notes}</p> : null}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t('trainingLog.edit')}
                        onClick={() => setDialog({ open: true, session: s })}
                      >
                        <Pencil aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t('trainingLog.delete')}
                        disabled={remove.isPending}
                        onClick={() => {
                          if (window.confirm(t('trainingLog.confirmDelete'))) remove.mutate(s.id);
                        }}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <TrainingSessionDialog
        open={dialog.open}
        session={dialog.session}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
      />
    </main>
  );
}
