import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { listBeltRanksQueryOptions } from '@/entities/belt-rank';
import {
  saveTrainingGoal,
  useTrainingGoalQuery,
  useTrainingLogMutation,
  type TrainingGoal,
} from '@/entities/training-log';
import { rankLabel } from '@/shared/lib/rank-label';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DatePicker,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui';

const NONE = '__none';

/** Edit the personal goals: a rank by a date, and sessions per week. All optional. */
export function TrainingGoalForm(): React.ReactElement {
  const { t } = useTranslation();
  const goal = useTrainingGoalQuery();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">{t('trainingGoal.formTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        {goal.isPending ? (
          <p className="text-sm text-on-surface-variant">{t('common.loading')}</p>
        ) : goal.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {t('common.unknownError')}
          </p>
        ) : (
          <GoalFields initial={goal.data} />
        )}
      </CardContent>
    </Card>
  );
}

function GoalFields({ initial }: { initial: TrainingGoal }): React.ReactElement {
  const { t, i18n } = useTranslation();
  const ranks = useQuery(listBeltRanksQueryOptions());
  const save = useTrainingLogMutation(saveTrainingGoal);

  const [rankId, setRankId] = React.useState(initial.targetRankId ?? NONE);
  const [date, setDate] = React.useState(initial.targetDate ?? '');
  const [perWeek, setPerWeek] = React.useState(
    initial.sessionsPerWeek ? String(initial.sessionsPerWeek) : '',
  );
  const [status, setStatus] = React.useState<'idle' | 'saved' | 'invalid' | 'error'>('idle');

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const sessionsPerWeek = perWeek.trim() === '' ? null : Number(perWeek);
    if (
      sessionsPerWeek !== null &&
      (!Number.isInteger(sessionsPerWeek) || sessionsPerWeek < 1 || sessionsPerWeek > 14)
    ) {
      setStatus('invalid');
      return;
    }
    save.mutate(
      { targetRankId: rankId === NONE ? null : rankId, targetDate: date || null, sessionsPerWeek },
      { onSuccess: () => setStatus('saved'), onError: () => setStatus('error') },
    );
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="goal-rank">{t('trainingGoal.targetRank')}</Label>
          <Select value={rankId} onValueChange={setRankId}>
            <SelectTrigger id="goal-rank">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t('trainingGoal.noTarget')}</SelectItem>
              {(ranks.data ?? []).map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {rankLabel(r, i18n.language)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="goal-date">{t('trainingGoal.targetDate')}</Label>
          <DatePicker id="goal-date" value={date} onChange={setDate} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="goal-per-week">{t('trainingGoal.sessionsPerWeek')}</Label>
          <Input
            id="goal-per-week"
            type="number"
            inputMode="numeric"
            min={1}
            max={14}
            value={perWeek}
            onChange={(e) => setPerWeek(e.target.value)}
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={save.isPending}>
          {t('common.save')}
        </Button>
        {status === 'saved' ? (
          <span className="text-sm text-on-surface-variant">{t('trainingGoal.saved')}</span>
        ) : null}
        {status === 'invalid' ? (
          <span role="alert" className="text-sm text-destructive">
            {t('trainingGoal.perWeekInvalid')}
          </span>
        ) : null}
        {status === 'error' ? (
          <span role="alert" className="text-sm text-destructive">
            {t('common.unknownError')}
          </span>
        ) : null}
      </div>
    </form>
  );
}
