import { useNavigate, useSearch } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { Technique } from '@repo/contracts/techniques';

import { useClassificationCategoriesByRootQuery } from '@/entities/classification-category';
import {
  useDeleteTechniqueMutation,
  useTechniquesQuery,
} from '@/entities/technique';
import { TechniqueListItem } from '@/features/technique-list-item';
import { Button, ClassificationMultiSelect } from '@/shared/ui';

/**
 * Admin technique catalogue list page. Filter state lives in the URL as
 * comma-separated classification **codes** under `?type=…&sotai=…&attack=…`;
 * resolution to UUIDs happens at render time via the classification
 * queries. Row click navigates to view; Delete is inline.
 */
export function AdminTechniquesListPage(): React.ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const search = useSearch({ from: '/_app/admin/techniques/' }) as {
    type?: string;
    sotai?: string;
    attack?: string;
  };

  const typeOpts = useClassificationCategoriesByRootQuery('technique_type');
  const sotaiOpts = useClassificationCategoriesByRootQuery('sotai_category');
  const attackOpts = useClassificationCategoriesByRootQuery('attack_type');

  const typeIdByCode = React.useMemo(
    () => new Map((typeOpts.data ?? []).map((c) => [c.code, c.id] as const)),
    [typeOpts.data],
  );
  const typeCodeById = React.useMemo(
    () => new Map((typeOpts.data ?? []).map((c) => [c.id, c.code] as const)),
    [typeOpts.data],
  );
  const sotaiIdByCode = React.useMemo(
    () => new Map((sotaiOpts.data ?? []).map((c) => [c.code, c.id] as const)),
    [sotaiOpts.data],
  );
  const sotaiCodeById = React.useMemo(
    () => new Map((sotaiOpts.data ?? []).map((c) => [c.id, c.code] as const)),
    [sotaiOpts.data],
  );
  const attackIdByCode = React.useMemo(
    () => new Map((attackOpts.data ?? []).map((c) => [c.code, c.id] as const)),
    [attackOpts.data],
  );
  const attackCodeById = React.useMemo(
    () => new Map((attackOpts.data ?? []).map((c) => [c.id, c.code] as const)),
    [attackOpts.data],
  );

  const codesToIds = (
    csv: string | undefined,
    idByCode: Map<string, string>,
  ): string[] =>
    (csv ?? '')
      .split(',')
      .filter(Boolean)
      .map((code) => idByCode.get(code))
      .filter((id): id is string => Boolean(id));

  const typeIds = React.useMemo(
    () => codesToIds(search.type, typeIdByCode),
    [search.type, typeIdByCode],
  );
  const sotaiIds = React.useMemo(
    () => codesToIds(search.sotai, sotaiIdByCode),
    [search.sotai, sotaiIdByCode],
  );
  const attackIds = React.useMemo(
    () => codesToIds(search.attack, attackIdByCode),
    [search.attack, attackIdByCode],
  );

  const filterIds = React.useMemo(
    () => [...typeIds, ...sotaiIds, ...attackIds],
    [typeIds, sotaiIds, attackIds],
  );
  const { data: techniques = [] } = useTechniquesQuery(filterIds);
  const deleteMut = useDeleteTechniqueMutation();

  const idsToCsv = (
    ids: string[],
    codeById: Map<string, string>,
  ): string | undefined => {
    const codes = ids
      .map((id) => codeById.get(id))
      .filter((c): c is string => Boolean(c));
    return codes.length > 0 ? codes.join(',') : undefined;
  };

  type Search = { type?: string; sotai?: string; attack?: string };

  const updateKey = (key: keyof Search, value: string | undefined): void => {
    void navigate({
      to: '/admin/techniques',
      // `exactOptionalPropertyTypes` rejects `{ key: undefined }`, so omit
      // empty keys via destructuring rather than reassigning to undefined.
      search: (prev) => {
        const { [key]: _drop, ...rest } = prev as Search;
        return value !== undefined ? { ...rest, [key]: value } : rest;
      },
    });
  };

  const setTypeFilter = (ids: string[]): void =>
    updateKey('type', idsToCsv(ids, typeCodeById));
  const setSotaiFilter = (ids: string[]): void =>
    updateKey('sotai', idsToCsv(ids, sotaiCodeById));
  const setAttackFilter = (ids: string[]): void =>
    updateKey('attack', idsToCsv(ids, attackCodeById));

  const onNew = (): void => {
    void navigate({ to: '/admin/techniques/new' });
  };
  const onRowClick = (row: Technique): void => {
    void navigate({
      to: '/admin/techniques/$techniqueId',
      params: { techniqueId: row.id },
    });
  };
  const onDelete = (row: Technique): void => {
    if (window.confirm(t('admin.techniques.deleteConfirm'))) {
      deleteMut.mutate(row.id);
    }
  };

  return (
    <main className="container py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t('admin.techniques.title')}
          </h1>
          <p className="mt-2 max-w-2xl text-on-surface-variant">
            {t('admin.techniques.description')}
          </p>
        </div>
        <Button onClick={onNew} className="gap-2">
          <Plus className="size-4" aria-hidden />
          {t('admin.techniques.newTechnique')}
        </Button>
      </div>

      <section
        aria-label={t('techniques.filters.techniqueType')}
        className="mt-6 space-y-3"
      >
        <ClassificationMultiSelect
          options={typeOpts.data ?? []}
          isPending={typeOpts.isPending}
          selectedIds={typeIds}
          onChange={setTypeFilter}
          label={t('techniques.filters.techniqueType')}
        />
        <ClassificationMultiSelect
          options={sotaiOpts.data ?? []}
          isPending={sotaiOpts.isPending}
          selectedIds={sotaiIds}
          onChange={setSotaiFilter}
          label={t('techniques.filters.sotaiCategory')}
        />
        <ClassificationMultiSelect
          options={attackOpts.data ?? []}
          isPending={attackOpts.isPending}
          selectedIds={attackIds}
          onChange={setAttackFilter}
          label={t('techniques.filters.attackType')}
        />
      </section>

      <section className="mt-8">
        <ul className="space-y-2">
          {techniques.map((row) => (
            <TechniqueListItem
              key={row.id}
              technique={row}
              onClick={onRowClick}
              onDelete={onDelete}
              isDeleting={deleteMut.isPending}
            />
          ))}
        </ul>
      </section>
    </main>
  );
}
