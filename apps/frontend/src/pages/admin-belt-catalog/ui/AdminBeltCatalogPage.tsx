import { useQuery } from '@tanstack/react-query';
import { Award, Layers, Trophy } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  listBeltRanksQueryOptions,
  type BeltRank,
} from '@/entities/belt-rank';
import {
  listBeltSystemsQueryOptions,
  type BeltSystem,
} from '@/entities/belt-system';
import { listOrganisationsQueryOptions } from '@/entities/organisation';
import {
  listShogoTitlesQueryOptions,
  type ShogoTitle,
} from '@/entities/shogo-title';
import { BeltRankForm } from '@/features/belt-rank-form';
import { BeltRanksTable, type RankGroup } from '@/features/belt-ranks-table';
import { BeltSystemForm } from '@/features/belt-system-form';
import { BeltSystemsTable } from '@/features/belt-systems-table';
import { ShogoTitleForm } from '@/features/shogo-title-form';
import { ShogoTitlesTable } from '@/features/shogo-titles-table';
import { Button, Label } from '@/shared/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs.js';

type Mode<T> = { kind: 'closed' } | { kind: 'create' } | { kind: 'edit'; row: T };

const ORG_ALL = '__all__';
const ORG_GLOBAL = '__global__';
const SYS_ALL = '__all__';

type GroupBy = 'none' | 'org' | 'system';
type SortBy = 'sortOrder' | 'levelAsc' | 'levelDesc' | 'romaji';

export function AdminBeltCatalogPage(): React.ReactElement {
  const { t } = useTranslation();

  const systemsQuery = useQuery(listBeltSystemsQueryOptions());
  const ranksQuery = useQuery(listBeltRanksQueryOptions());
  const shogosQuery = useQuery(listShogoTitlesQueryOptions());
  const orgsQuery = useQuery(listOrganisationsQueryOptions());

  const [sysMode, setSysMode] = React.useState<Mode<BeltSystem>>({ kind: 'closed' });
  const [rankMode, setRankMode] = React.useState<Mode<BeltRank>>({ kind: 'closed' });
  const [shogoMode, setShogoMode] = React.useState<Mode<ShogoTitle>>({ kind: 'closed' });

  // Ranks-tab toolbar state — filter, group, sort.
  const [filterOrg, setFilterOrg] = React.useState<string>(ORG_ALL);
  const [filterSystem, setFilterSystem] = React.useState<string>(SYS_ALL);
  const [groupBy, setGroupBy] = React.useState<GroupBy>('none');
  const [sortBy, setSortBy] = React.useState<SortBy>('sortOrder');

  // Memoize the array coalesces so downstream useMemo deps stay
  // reference-stable across renders (react-hooks/exhaustive-deps).
  const systems = React.useMemo(() => systemsQuery.data ?? [], [systemsQuery.data]);
  const allRanks = React.useMemo(() => ranksQuery.data ?? [], [ranksQuery.data]);
  const orgs = React.useMemo(() => orgsQuery.data?.data ?? [], [orgsQuery.data]);

  /** Orgs that own at least one belt_rank — the only ones the org filter lists. */
  const orgsWithRanks = React.useMemo(() => {
    const ids = new Set<string>();
    for (const r of allRanks) if (r.organisationId) ids.add(r.organisationId);
    return orgs.filter((o) => ids.has(o.id));
  }, [orgs, allRanks]);

  const systemsById = React.useMemo(() => {
    const map = new Map<string, BeltSystem>();
    for (const s of systems) map.set(s.id, s);
    return map;
  }, [systems]);

  const orgsById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const o of orgs) map.set(o.id, o.nameEn);
    return map;
  }, [orgs]);

  // Filter → sort → optionally group.
  const rankGroups = React.useMemo<RankGroup[]>(() => {
    let rows = allRanks;
    if (filterOrg === ORG_GLOBAL) {
      rows = rows.filter((r) => r.organisationId === null);
    } else if (filterOrg !== ORG_ALL) {
      rows = rows.filter((r) => r.organisationId === filterOrg);
    }
    if (filterSystem !== SYS_ALL) {
      rows = rows.filter((r) => r.systemId === filterSystem);
    }

    const sorted = [...rows];
    if (sortBy === 'levelAsc') sorted.sort((a, b) => a.level - b.level);
    else if (sortBy === 'levelDesc') sorted.sort((a, b) => b.level - a.level);
    else if (sortBy === 'romaji') sorted.sort((a, b) => a.nameRomaji.localeCompare(b.nameRomaji));
    else sorted.sort((a, b) => a.sortOrder - b.sortOrder);

    if (groupBy === 'none') {
      return [{ key: 'all', rows: sorted }];
    }

    const map = new Map<string, RankGroup>();
    for (const r of sorted) {
      let key: string;
      let label: string;
      if (groupBy === 'org') {
        key = r.organisationId ?? ORG_GLOBAL;
        label =
          r.organisationId === null
            ? t('admin.beltCatalog.organisationGlobal')
            : (orgsById.get(r.organisationId) ?? r.organisationId);
      } else {
        key = r.systemId;
        label = systemsById.get(key)?.nameEn ?? '—';
      }
      const existing = map.get(key);
      if (existing) existing.rows.push(r);
      else map.set(key, { key, label, rows: [r] });
    }
    return Array.from(map.values()).sort((a, b) => (a.label ?? '').localeCompare(b.label ?? ''));
  }, [allRanks, filterOrg, filterSystem, sortBy, groupBy, orgsById, systemsById, t]);

  return (
    <div className="container mx-auto max-w-5xl py-8">
      <h1 className="font-headline text-3xl">{t('admin.beltCatalog.title')}</h1>
      <p className="mt-2 text-on-surface-variant">{t('admin.beltCatalog.description')}</p>

      <Tabs defaultValue="systems" className="mt-6">
        <TabsList>
          <TabsTrigger value="systems" className="gap-2">
            <Layers className="size-4" aria-hidden />
            {t('admin.beltCatalog.tabs.systems')}
          </TabsTrigger>
          <TabsTrigger value="ranks" className="gap-2">
            <Award className="size-4" aria-hidden />
            {t('admin.beltCatalog.tabs.ranks')}
          </TabsTrigger>
          <TabsTrigger value="shogos" className="gap-2">
            <Trophy className="size-4" aria-hidden />
            {t('admin.beltCatalog.tabs.shogos')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="systems" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setSysMode({ kind: 'create' })}>
              {t('admin.beltCatalog.addSystem')}
            </Button>
          </div>
          {sysMode.kind !== 'closed' ? (
            <BeltSystemForm
              {...(sysMode.kind === 'edit' ? { system: sysMode.row } : {})}
              onSaved={() => setSysMode({ kind: 'closed' })}
              onCancel={() => setSysMode({ kind: 'closed' })}
            />
          ) : null}
          <BeltSystemsTable
            systems={systemsQuery.data ?? []}
            onEdit={(row) => setSysMode({ kind: 'edit', row })}
          />
        </TabsContent>

        <TabsContent value="ranks" className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[10rem]">
              <Label htmlFor="rk-filter-org" className="text-xs">
                {t('admin.beltCatalog.toolbar.filterOrg')}
              </Label>
              <Select value={filterOrg} onValueChange={setFilterOrg}>
                <SelectTrigger id="rk-filter-org"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ORG_ALL}>{t('admin.beltCatalog.toolbar.allOrgs')}</SelectItem>
                  <SelectItem value={ORG_GLOBAL}>
                    {t('admin.beltCatalog.organisationGlobal')}
                  </SelectItem>
                  {orgsWithRanks.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.nameEn} ({o.shortCode})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-[10rem]">
              <Label htmlFor="rk-filter-sys" className="text-xs">
                {t('admin.beltCatalog.toolbar.filterSystem')}
              </Label>
              <Select value={filterSystem} onValueChange={setFilterSystem}>
                <SelectTrigger id="rk-filter-sys"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SYS_ALL}>{t('admin.beltCatalog.toolbar.allSystems')}</SelectItem>
                  {systems.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.nameEn} ({s.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-[10rem]">
              <Label htmlFor="rk-group" className="text-xs">
                {t('admin.beltCatalog.toolbar.groupBy')}
              </Label>
              <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
                <SelectTrigger id="rk-group"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('admin.beltCatalog.toolbar.groupNone')}</SelectItem>
                  <SelectItem value="org">{t('admin.beltCatalog.toolbar.groupOrg')}</SelectItem>
                  <SelectItem value="system">{t('admin.beltCatalog.toolbar.groupSystem')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-[10rem]">
              <Label htmlFor="rk-sort" className="text-xs">
                {t('admin.beltCatalog.toolbar.sortBy')}
              </Label>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
                <SelectTrigger id="rk-sort"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sortOrder">{t('admin.beltCatalog.toolbar.sortSortOrder')}</SelectItem>
                  <SelectItem value="levelAsc">{t('admin.beltCatalog.toolbar.sortLevelAsc')}</SelectItem>
                  <SelectItem value="levelDesc">{t('admin.beltCatalog.toolbar.sortLevelDesc')}</SelectItem>
                  <SelectItem value="romaji">{t('admin.beltCatalog.toolbar.sortRomaji')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="ml-auto">
              <Button onClick={() => setRankMode({ kind: 'create' })}>
                {t('admin.beltCatalog.addRank')}
              </Button>
            </div>
          </div>

          {rankMode.kind !== 'closed' ? (
            <BeltRankForm
              {...(rankMode.kind === 'edit' ? { rank: rankMode.row } : {})}
              onSaved={() => setRankMode({ kind: 'closed' })}
              onCancel={() => setRankMode({ kind: 'closed' })}
            />
          ) : null}

          <BeltRanksTable
            groups={rankGroups}
            systems={systems}
            orgs={orgs}
            onEdit={(row) => setRankMode({ kind: 'edit', row })}
          />
        </TabsContent>

        <TabsContent value="shogos" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShogoMode({ kind: 'create' })}>
              {t('admin.beltCatalog.addShogo')}
            </Button>
          </div>
          {shogoMode.kind !== 'closed' ? (
            <ShogoTitleForm
              {...(shogoMode.kind === 'edit' ? { shogo: shogoMode.row } : {})}
              onSaved={() => setShogoMode({ kind: 'closed' })}
              onCancel={() => setShogoMode({ kind: 'closed' })}
            />
          ) : null}
          <ShogoTitlesTable
            shogos={shogosQuery.data ?? []}
            ranks={ranksQuery.data ?? []}
            onEdit={(row) => setShogoMode({ kind: 'edit', row })}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
