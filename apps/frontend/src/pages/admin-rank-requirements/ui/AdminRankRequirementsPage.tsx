import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { BeltRank } from '@repo/contracts/ranks';

import { listBeltRanksQueryOptions } from '@/entities/belt-rank';
import { useRequirementSetsQuery } from '@/entities/requirement-set';
import { RankRequirementsEditor } from '@/features/rank-requirements-editor';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui';

/** Picks the localised rank label, falling back to the romaji name. */
function rankLabel(rank: BeltRank, lang: string): string {
  const byLang: Record<string, string> = {
    en: rank.nameEn,
    sv: rank.nameSv,
    fi: rank.nameFi,
  };
  return byLang[lang] || rank.nameEn || rank.nameRomaji;
}

interface RankRequirementsSearch {
  setId?: string;
  rankId?: string;
}

/**
 * Admin page for editing a single rank's grading requirements within a
 * requirement set. Two selectors — requirement set and rank — both persist
 * to the URL (`?setId=&rankId=`) via `useSearch`/`useNavigate`, so a picked
 * combination survives a refresh or can be shared as a link. The actual
 * editing surface (`<RankRequirementsEditor>`, Task 18) only mounts once
 * both are chosen; before that the page shows selection prompts instead of
 * a half-configured form.
 */
export function AdminRankRequirementsPage(): React.ReactElement {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const search = useSearch({
    from: '/_app/admin/rank-requirements/',
  }) as RankRequirementsSearch;

  const setId = search.setId;
  const rankId = search.rankId;

  const { data: sets = [] } = useRequirementSetsQuery();
  const { data: ranks = [] } = useQuery(listBeltRanksQueryOptions());

  const sortedRanks = React.useMemo(
    () => [...ranks].sort((a, b) => a.sortOrder - b.sortOrder),
    [ranks],
  );

  const setSetId = (nextSetId: string): void => {
    void navigate({
      to: '/admin/rank-requirements',
      search: (prev) => ({ ...prev, setId: nextSetId }),
    });
  };

  const setRankId = (nextRankId: string): void => {
    void navigate({
      to: '/admin/rank-requirements',
      search: (prev) => ({ ...prev, rankId: nextRankId }),
    });
  };

  return (
    <main className="container py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('admin.rankRequirements.title')}
        </h1>
        <p className="mt-2 max-w-2xl text-on-surface-variant">
          {t('admin.rankRequirements.description')}
        </p>
      </div>

      <div className="mt-6 flex flex-wrap gap-4">
        <div className="min-w-[240px]">
          <Select value={setId ?? ''} onValueChange={setSetId}>
            <SelectTrigger aria-label={t('admin.rankRequirements.selectSet')}>
              <SelectValue placeholder={t('admin.rankRequirements.selectSet')} />
            </SelectTrigger>
            <SelectContent>
              {sets.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-[240px]">
          <Select value={rankId ?? ''} onValueChange={setRankId}>
            <SelectTrigger aria-label={t('admin.rankRequirements.selectRank')}>
              <SelectValue placeholder={t('admin.rankRequirements.selectRank')} />
            </SelectTrigger>
            <SelectContent>
              {sortedRanks.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {rankLabel(r, i18n.language)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <section className="mt-8">
        {setId && rankId ? (
          <RankRequirementsEditor key={`${setId}:${rankId}`} setId={setId} rankId={rankId} />
        ) : (
          <p className="text-on-surface-variant">
            {!setId
              ? t('admin.rankRequirements.selectSet')
              : t('admin.rankRequirements.selectRank')}
          </p>
        )}
      </section>
    </main>
  );
}
