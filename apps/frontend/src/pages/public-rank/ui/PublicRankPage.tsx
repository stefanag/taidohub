import { Link, useParams } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { publicRankQueryOptions } from '@/entities/belt-rank';
import { RankRequirementsDisplay } from '@/features/rank-requirements-display';
import { type Lang } from '@/shared/lib/rank-label';
import { BeltGraphic } from '@/shared/ui/belt-graphic';

// The technique/pattern catalogue endpoints require an authenticated
// session, so this unauthenticated page cannot resolve requirement ids to
// technique/pattern names. `RankRequirementsDisplay` already degrades
// gracefully (falls back to the raw id) when a lookup entry is missing, so
// an empty lookup here is a deliberate, documented gap rather than a bug —
// see Task 25 report for the follow-up (a public techniques/patterns
// catalogue projection) needed to show real names on this page.
const EMPTY_LOOKUP = { techniques: new Map(), patterns: new Map() };

function pickDescription(
  rank: { descriptionEn: string | null; descriptionSv: string | null; descriptionFi: string | null },
  lang: string,
): string | null {
  return lang === 'fi' ? rank.descriptionFi : lang === 'sv' ? rank.descriptionSv : rank.descriptionEn;
}

export function PublicRankPage(): React.ReactElement {
  const { t, i18n } = useTranslation();
  const params = useParams({ strict: false }) as { slug: string };
  const slug = params.slug;

  const query = useQuery(publicRankQueryOptions(slug));

  React.useEffect(() => {
    const tag = document.createElement('meta');
    tag.name = 'robots';
    tag.content = 'noindex';
    document.head.appendChild(tag);
    return () => {
      document.head.removeChild(tag);
    };
  }, []);

  if (query.isLoading) {
    return (
      <main className="container mx-auto max-w-3xl px-6 py-16 text-center text-on-surface-variant">
        {t('common.loading')}
      </main>
    );
  }

  if (!query.data) {
    return (
      <main className="container mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="font-headline text-3xl text-primary">
          {t('publicRank.notFoundTitle')}
        </h1>
        <p className="mt-4 text-on-surface-variant">{t('publicRank.notFoundBody')}</p>
        <Link to="/login" className="mt-8 inline-block text-primary underline">
          {t('publicRank.signIn')}
        </Link>
      </main>
    );
  }

  const { rank } = query.data;
  const lang = i18n.language as Lang;
  const localised =
    lang === 'fi' ? rank.nameFi : lang === 'sv' ? rank.nameSv : rank.nameEn;
  const description = pickDescription(rank, lang);

  return (
    <main className="container mx-auto max-w-3xl px-6 py-10">
      <header className="mb-10">
        <div className="flex items-baseline gap-4">
          <div className="font-headline text-5xl text-primary">
            {localised || rank.nameRomaji}
          </div>
          {rank.nameJa ? (
            <div className="font-headline text-3xl italic text-on-surface-variant">
              {rank.nameJa}
            </div>
          ) : null}
        </div>
        {rank.nameRomaji && rank.nameRomaji !== localised ? (
          <div className="mt-2 text-lg text-on-surface-variant">{rank.nameRomaji}</div>
        ) : null}
        <BeltGraphic {...rank.visuals} className="mt-6 w-full max-w-md" />
      </header>

      {description ? (
        <section className="mb-10 text-on-surface">
          <p>{description}</p>
        </section>
      ) : null}

      {query.data.requirements ? (
        <section className="mb-10">
          <h2 className="mb-4 font-headline text-2xl text-primary">
            {t('students.detail.requirements')}
          </h2>
          <RankRequirementsDisplay
            requirements={query.data.requirements}
            techProgress={[]}
            patProgress={[]}
            lookup={EMPTY_LOOKUP}
          />
        </section>
      ) : null}

      <p className="mt-12">
        <Link to="/" className="text-primary underline">
          {t('publicRank.backHome')}
        </Link>
      </p>
    </main>
  );
}
