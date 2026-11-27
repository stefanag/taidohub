import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  buildTerms,
  makeQuestions,
  shuffle,
  type Direction,
  type Question,
  type Term,
} from '../lib/quiz.js';

import { usePatternsQuery } from '@/entities/pattern';
import { useTechniquesQuery } from '@/entities/technique';
import { useFeatureFlag } from '@/shared/lib/feature-flags';
import {
  Button,
  Card,
  CardContent,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/shared/ui';

type Scope = 'all' | 'technique' | 'pattern';
const ROUND = 10;

/**
 * Terminology self-test: multiple choice and flashcards, Japanese name
 * against the name in the reader's language, generated from the technique
 * and pattern catalogue. Nothing is stored. Behind the `self-test` flag.
 */
export function SelfTestPage(): React.ReactElement {
  const { t, i18n } = useTranslation();
  const enabled = useFeatureFlag('self-test');
  const techniques = useTechniquesQuery();
  const patterns = usePatternsQuery();
  const [scope, setScope] = React.useState<Scope>('all');
  const [direction, setDirection] = React.useState<Direction>('ja-to-local');

  const terms = React.useMemo(() => {
    const all = buildTerms(
      { techniques: techniques.data ?? [], patterns: patterns.data ?? [] },
      i18n.language,
    );
    return scope === 'all' ? all : all.filter((x) => x.kind === scope);
  }, [techniques.data, patterns.data, i18n.language, scope]);

  if (!enabled) {
    return (
      <main className="mx-auto max-w-[720px] p-8">
        <p className="text-on-surface-variant">{t('selfTest.unavailable')}</p>
      </main>
    );
  }

  const loading = techniques.isPending || patterns.isPending;
  const settingsKey = `${scope}:${direction}:${i18n.language}:${terms.length}`;

  return (
    <main className="mx-auto max-w-[720px] space-y-6 p-8">
      <header className="space-y-1">
        <h1 className="font-headline text-3xl font-extrabold tracking-tight text-primary">
          {t('selfTest.title')}
        </h1>
        <p className="text-sm text-on-surface-variant">{t('selfTest.intro')}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="self-test-scope">{t('selfTest.scope')}</Label>
          <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
            <SelectTrigger id="self-test-scope">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('selfTest.scopes.all')}</SelectItem>
              <SelectItem value="technique">{t('selfTest.scopes.technique')}</SelectItem>
              <SelectItem value="pattern">{t('selfTest.scopes.pattern')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="self-test-direction">{t('selfTest.direction')}</Label>
          <Select value={direction} onValueChange={(v) => setDirection(v as Direction)}>
            <SelectTrigger id="self-test-direction">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ja-to-local">{t('selfTest.directions.jaToLocal')}</SelectItem>
              <SelectItem value="local-to-ja">{t('selfTest.directions.localToJa')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <p className="text-on-surface-variant">{t('common.loading')}</p>
      ) : terms.length < 4 ? (
        <p className="text-on-surface-variant" data-testid="self-test-too-few">
          {t('selfTest.tooFew')}
        </p>
      ) : (
        <Tabs defaultValue="quiz">
          <TabsList>
            <TabsTrigger value="quiz">{t('selfTest.quiz')}</TabsTrigger>
            <TabsTrigger value="flashcards">{t('selfTest.flashcards')}</TabsTrigger>
          </TabsList>
          <TabsContent value="quiz">
            <Quiz key={settingsKey} terms={terms} direction={direction} />
          </TabsContent>
          <TabsContent value="flashcards">
            <Flashcards key={settingsKey} terms={terms} direction={direction} />
          </TabsContent>
        </Tabs>
      )}
    </main>
  );
}

function Quiz({ terms, direction }: { terms: Term[]; direction: Direction }): React.ReactElement {
  const { t } = useTranslation();
  const [questions, setQuestions] = React.useState<Question[]>(() =>
    makeQuestions(terms, direction, ROUND),
  );
  const [index, setIndex] = React.useState(0);
  const [chosen, setChosen] = React.useState<string | null>(null);
  const [score, setScore] = React.useState(0);

  const restart = () => {
    setQuestions(makeQuestions(terms, direction, ROUND));
    setIndex(0);
    setChosen(null);
    setScore(0);
  };

  if (index >= questions.length) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6">
          <p className="text-lg font-semibold" data-testid="self-test-score">
            {t('selfTest.score', { score, total: questions.length })}
          </p>
          <Button onClick={restart}>{t('selfTest.again')}</Button>
        </CardContent>
      </Card>
    );
  }

  const q = questions[index]!;
  const answered = chosen !== null;
  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <p className="text-sm text-on-surface-variant">
          {t('selfTest.progress', { current: index + 1, total: questions.length })}
        </p>
        <p className="text-xl font-semibold" data-testid="self-test-prompt">
          {q.prompt}
        </p>
        <div className="grid gap-2">
          {q.options.map((option) => {
            const state = !answered
              ? ''
              : option === q.answer
                ? 'border-primary bg-primary/10'
                : option === chosen
                  ? 'border-destructive bg-destructive/10'
                  : '';
            return (
              <button
                key={option}
                type="button"
                disabled={answered}
                className={`rounded-md border border-outline-variant/40 px-3 py-2 text-left text-sm ${state}`}
                onClick={() => {
                  setChosen(option);
                  if (option === q.answer) setScore((s) => s + 1);
                }}
              >
                {option}
              </button>
            );
          })}
        </div>
        {answered ? (
          <div className="flex items-center justify-between gap-3">
            <p role="status" className="text-sm">
              {chosen === q.answer
                ? t('selfTest.correct')
                : t('selfTest.wrong', { answer: q.answer })}
            </p>
            <Button
              onClick={() => {
                setIndex((i) => i + 1);
                setChosen(null);
              }}
            >
              {t('selfTest.next')}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Flashcards({
  terms,
  direction,
}: {
  terms: Term[];
  direction: Direction;
}): React.ReactElement {
  const { t } = useTranslation();
  const [deck, setDeck] = React.useState<Term[]>(() => shuffle(terms));
  const [index, setIndex] = React.useState(0);
  const [flipped, setFlipped] = React.useState(false);
  const card = deck[index]!;
  const front = direction === 'ja-to-local' ? card.japanese : card.translation;
  const back = direction === 'ja-to-local' ? card.translation : card.japanese;
  const go = (delta: number) => {
    setIndex((i) => (i + delta + deck.length) % deck.length);
    setFlipped(false);
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <p className="text-sm text-on-surface-variant">
          {t('selfTest.progress', { current: index + 1, total: deck.length })}
        </p>
        <button
          type="button"
          className="flex min-h-40 w-full flex-col items-center justify-center gap-2 rounded-md border border-outline-variant/40 p-6 text-center"
          onClick={() => setFlipped((f) => !f)}
          aria-label={t('selfTest.flip')}
        >
          <span className="text-xl font-semibold" data-testid="flashcard-front">
            {front}
          </span>
          {flipped ? (
            <span className="text-lg text-primary" data-testid="flashcard-back">
              {back}
            </span>
          ) : (
            <span className="text-sm text-on-surface-variant">{t('selfTest.tapToFlip')}</span>
          )}
        </button>
        <div className="flex justify-between gap-2">
          <Button variant="outline" onClick={() => go(-1)}>
            {t('selfTest.previous')}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setDeck(shuffle(terms));
              setIndex(0);
              setFlipped(false);
            }}
          >
            {t('selfTest.shuffle')}
          </Button>
          <Button onClick={() => go(1)}>{t('selfTest.next')}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
