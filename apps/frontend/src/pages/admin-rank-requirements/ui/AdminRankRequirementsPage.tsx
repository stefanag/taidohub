import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { BeltRank } from '@repo/contracts/ranks';

import { listBeltRanksQueryOptions, ranksForOrganisation } from '@/entities/belt-rank';
import { listBeltSystemsQueryOptions } from '@/entities/belt-system';
import { useRequirementSetsQuery } from '@/entities/requirement-set';
import { AgeGroupsPanel, RankRequirementsEditor } from '@/features/rank-requirements-editor';
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

/** Belt systems whose ranks may have age-based requirements (not `mon`). */
const AGE_GROUP_SYSTEMS = new Set(['kyu', 'dan']);

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
  const { data: systems = [] } = useQuery(listBeltSystemsQueryOptions());
  // The age-group tab being edited; reset whenever the set or rank changes.
  const [ageGroup, setAgeGroup] = React.useState<{ key: string; id: string | null }>({ key: '', id: null });
  const scopeKey = `${setId ?? ''}:${rankId ?? ''}`;
  const ageGroupId = ageGroup.key === scopeKey ? ageGroup.id : null;
  const selectedRank = ranks.find((r) => r.id === rankId);
  const allowsAgeGroups =
    !!selectedRank && AGE_GROUP_SYSTEMS.has(systems.find((s) => s.id === selectedRank.systemId)?.code ?? '');

  // Only the ladder the selected set resolves against (its organisation's
  // own ranks, else the global ones): the catalogue holds several ladders
  // with same-named ranks, so listing every rank shows duplicates.
  const selectedSet = sets.find((s) => s.id === setId);
  const sortedRanks = React.useMemo(
    () =>
      selectedSet
        ? ranksForOrganisation(ranks, selectedSet.organisationId).sort(
            (a, b) => a.sortOrder - b.sortOrder,
          )
        : [],
    [ranks, selectedSet],
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
          <Select value={rankId ?? ''} onValueChange={setRankId} disabled={!selectedSet}>
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
          <div className="space-y-6">
            {allowsAgeGroups ? (
              <AgeGroupsPanel
                setId={setId}
                rankId={rankId}
                selected={ageGroupId}
                onSelect={(id) => setAgeGroup({ key: scopeKey, id })}
              />
            ) : null}
            <RankRequirementsEditor
              key={`${setId}:${rankId}:${ageGroupId ?? 'base'}`}
              setId={setId}
              rankId={rankId}
              ageGroupId={ageGroupId}
            />
          </div>
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
