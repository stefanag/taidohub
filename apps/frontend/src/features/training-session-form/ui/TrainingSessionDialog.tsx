import { X } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { usePatternsQuery } from '@/entities/pattern';
import { useTechniquesQuery } from '@/entities/technique';
import {
  TRAINING_SESSION_KINDS,
  createTrainingSession,
  updateTrainingSession,
  useTrainingLogMutation,
  type TrainingSession,
  type TrainingSessionItem,
  type TrainingSessionKind,
} from '@/entities/training-log';
import { todayIso } from '@/shared/lib/grading-readiness';
import {
  Badge,
  Button,
  DatePicker,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui';

export interface TrainingSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit this session; omitted to log a new one. */
  session?: TrainingSession | undefined;
}

const SHOWN_MATCHES = 8;
const textareaClass =
  'w-full rounded-sm border border-outline-variant/40 bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-secondary';

const key = (item: TrainingSessionItem) => `${item.contentType}:${item.contentId}`;

/**
 * Log or edit a training session: date, kind, duration, notes, and the
 * techniques and patterns practised (which get "last practised" moved up).
 */
export function TrainingSessionDialog({
  open,
  onOpenChange,
  session,
}: TrainingSessionDialogProps): React.ReactElement {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {session ? t('trainingLog.form.editTitle') : t('trainingLog.form.newTitle')}
          </DialogTitle>
          <DialogDescription>{t('trainingLog.form.description')}</DialogDescription>
        </DialogHeader>
        {/* Remounted per opening so the fields start from the session (or blank). */}
        {open ? (
          <SessionForm
            key={session?.id ?? 'new'}
            session={session}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function SessionForm({
  session,
  onDone,
}: {
  session: TrainingSession | undefined;
  onDone: () => void;
}): React.ReactElement {
  const { t } = useTranslation();
  const techniques = useTechniquesQuery();
  const patterns = usePatternsQuery();

  const [date, setDate] = React.useState(() => session?.date ?? todayIso());
  const [kind, setKind] = React.useState<TrainingSessionKind>(session?.kind ?? 'club');
  const [duration, setDuration] = React.useState(
    session?.durationMinutes ? String(session.durationMinutes) : '',
  );
  const [notes, setNotes] = React.useState(session?.notes ?? '');
  const [items, setItems] = React.useState<TrainingSessionItem[]>(session?.items ?? []);
  const [search, setSearch] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const catalogue = React.useMemo(
    () => [
      ...(techniques.data ?? []).map((x) => ({
        item: { contentType: 'technique' as const, contentId: x.id },
        name: x.nameRomaji,
      })),
      ...(patterns.data ?? []).map((x) => ({
        item: { contentType: 'pattern' as const, contentId: x.id },
        name: x.nameRomaji,
      })),
    ],
    [techniques.data, patterns.data],
  );
  const names = React.useMemo(
    () => new Map(catalogue.map((c) => [key(c.item), c.name])),
    [catalogue],
  );
  const chosen = React.useMemo(() => new Set(items.map(key)), [items]);
  const matches = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return catalogue
      .filter((c) => !chosen.has(key(c.item)) && c.name.toLowerCase().includes(q))
      .slice(0, SHOWN_MATCHES);
  }, [catalogue, chosen, search]);

  const create = useTrainingLogMutation(createTrainingSession);
  const update = useTrainingLogMutation(updateTrainingSession);
  const pending = create.isPending || update.isPending;

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const minutes = duration.trim() === '' ? null : Number(duration);
    if (minutes !== null && (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440)) {
      setError(t('trainingLog.form.durationInvalid'));
      return;
    }
    const input = { date, kind, durationMinutes: minutes, notes: notes.trim() || null, items };
    const callbacks = {
      onSuccess: onDone,
      onError: () => setError(t('common.unknownError')),
    };
    if (session) update.mutate({ id: session.id, input }, callbacks);
    else create.mutate(input, callbacks);
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="session-date">{t('trainingLog.form.date')}</Label>
          <DatePicker id="session-date" value={date} onChange={setDate} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="session-kind">{t('trainingLog.form.kind')}</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as TrainingSessionKind)}>
            <SelectTrigger id="session-kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRAINING_SESSION_KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {t(`trainingLog.kind.${k}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="session-duration">{t('trainingLog.form.duration')}</Label>
        <Input
          id="session-duration"
          type="number"
          inputMode="numeric"
          min={1}
          max={1440}
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="session-items">{t('trainingLog.form.items')}</Label>
        {items.length > 0 ? (
          <ul className="flex flex-wrap gap-1" aria-label={t('trainingLog.form.chosenItems')}>
            {items.map((item) => (
              <li key={key(item)}>
                <Badge variant="secondary" className="gap-1">
                  {names.get(key(item)) ?? t('trainingLog.removedItem')}
                  <button
                    type="button"
                    aria-label={t('trainingLog.form.removeItem', {
                      name: names.get(key(item)) ?? '',
                    })}
                    onClick={() => setItems((prev) => prev.filter((p) => key(p) !== key(item)))}
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </Badge>
              </li>
            ))}
          </ul>
        ) : null}
        <Input
          id="session-items"
          value={search}
          placeholder={t('trainingLog.form.searchPlaceholder')}
          onChange={(e) => setSearch(e.target.value)}
        />
        {matches.length > 0 ? (
          <ul className="rounded-sm border border-outline-variant/40">
            {matches.map((m) => (
              <li key={key(m.item)}>
                <button
                  type="button"
                  className="flex w-full justify-between px-3 py-1.5 text-left text-sm hover:bg-surface-container-high"
                  onClick={() => {
                    setItems((prev) => [...prev, m.item]);
                    setSearch('');
                  }}
                >
                  <span>{m.name}</span>
                  <span className="text-on-surface-variant">
                    {t(`trainingLog.contentType.${m.item.contentType}`)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="space-y-1">
        <Label htmlFor="session-notes">{t('trainingLog.form.notes')}</Label>
        <textarea
          id="session-notes"
          rows={3}
          maxLength={4000}
          className={textareaClass}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={pending || !date}>
          {t('common.save')}
        </Button>
      </DialogFooter>
    </form>
  );
}
