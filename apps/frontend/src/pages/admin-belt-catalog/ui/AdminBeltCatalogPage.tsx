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
import {
  listShogoTitlesQueryOptions,
  type ShogoTitle,
} from '@/entities/shogo-title';
import { BeltRankForm } from '@/features/belt-rank-form';
import { BeltRanksTable } from '@/features/belt-ranks-table';
import { BeltSystemForm } from '@/features/belt-system-form';
import { BeltSystemsTable } from '@/features/belt-systems-table';
import { ShogoTitleForm } from '@/features/shogo-title-form';
import { ShogoTitlesTable } from '@/features/shogo-titles-table';
import { Button } from '@/shared/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs.js';

type Mode<T> = { kind: 'closed' } | { kind: 'create' } | { kind: 'edit'; row: T };

export function AdminBeltCatalogPage(): React.ReactElement {
  const { t } = useTranslation();

  const systemsQuery = useQuery(listBeltSystemsQueryOptions());
  const ranksQuery = useQuery(listBeltRanksQueryOptions());
  const shogosQuery = useQuery(listShogoTitlesQueryOptions());

  const [sysMode, setSysMode] = React.useState<Mode<BeltSystem>>({ kind: 'closed' });
  const [rankMode, setRankMode] = React.useState<Mode<BeltRank>>({ kind: 'closed' });
  const [shogoMode, setShogoMode] = React.useState<Mode<ShogoTitle>>({ kind: 'closed' });

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
          <div className="flex justify-end">
            <Button onClick={() => setRankMode({ kind: 'create' })}>
              {t('admin.beltCatalog.addRank')}
            </Button>
          </div>
          {rankMode.kind !== 'closed' ? (
            <BeltRankForm
              {...(rankMode.kind === 'edit' ? { rank: rankMode.row } : {})}
              onSaved={() => setRankMode({ kind: 'closed' })}
              onCancel={() => setRankMode({ kind: 'closed' })}
            />
          ) : null}
          <BeltRanksTable
            ranks={ranksQuery.data ?? []}
            systems={systemsQuery.data ?? []}
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
