import { useNavigate, useSearch } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { Pattern } from '@repo/contracts/patterns';

import { useClassificationCategoriesByRootQuery } from '@/entities/classification-category';
import {
  useDeletePatternMutation,
  usePatternsQuery,
} from '@/entities/pattern';
import { PatternListItem } from '@/features/pattern-list-item';
import { Button, ClassificationMultiSelect } from '@/shared/ui';

/**
 * Admin pattern catalogue list page (sysadmin-only — the layout route
 * carries the guard once). Filter state lives in the URL as
 * comma-separated **classification codes** under `?type=…&subtype=…`;
 * resolution to UUIDs happens at render time via the classification
 * queries. Codes are the user-stable handle, so the URL stays
 * human-readable and survives classification ID changes.
 *
 * Row click → view page. Delete is inline (`window.confirm` + mutation).
 * "New pattern" navigates to the create page.
 */
export function AdminPatternsListPage(): React.ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const search = useSearch({ from: '/_app/admin/patterns/' }) as {
    type?: string;
    subtype?: string;
  };

  const typeOpts = useClassificationCategoriesByRootQuery('pattern_type');
  const subtypeOpts = useClassificationCategoriesByRootQuery('hokei_subtype');

  // Build code ↔ id bridges so the URL stays in codes but the API call uses UUIDs.
  const typeIdByCode = React.useMemo(
    () => new Map((typeOpts.data ?? []).map((c) => [c.code, c.id] as const)),
    [typeOpts.data],
  );
  const typeCodeById = React.useMemo(
    () => new Map((typeOpts.data ?? []).map((c) => [c.id, c.code] as const)),
    [typeOpts.data],
  );
  const subtypeIdByCode = React.useMemo(
    () => new Map((subtypeOpts.data ?? []).map((c) => [c.code, c.id] as const)),
    [subtypeOpts.data],
  );
  const subtypeCodeById = React.useMemo(
    () => new Map((subtypeOpts.data ?? []).map((c) => [c.id, c.code] as const)),
    [subtypeOpts.data],
  );

  const typeIds = React.useMemo(
    () =>
      (search.type ?? '')
        .split(',')
        .filter(Boolean)
        .map((code) => typeIdByCode.get(code))
        .filter((id): id is string => Boolean(id)),
    [search.type, typeIdByCode],
  );
  const subtypeIds = React.useMemo(
    () =>
      (search.subtype ?? '')
        .split(',')
        .filter(Boolean)
        .map((code) => subtypeIdByCode.get(code))
        .filter((id): id is string => Boolean(id)),
    [search.subtype, subtypeIdByCode],
  );

  const hokeiTypeId = React.useMemo(
    () => (typeOpts.data ?? []).find((o) => o.code === 'hokei')?.id,
    [typeOpts.data],
  );
  const showSubtype = Boolean(hokeiTypeId) && typeIds.includes(hokeiTypeId!);

  const filterIds = React.useMemo(
    () => [...typeIds, ...(showSubtype ? subtypeIds : [])],
    [typeIds, subtypeIds, showSubtype],
  );
  const { data: patterns = [] } = usePatternsQuery(filterIds);
  const deleteMut = useDeletePatternMutation();

  const idsToSearchString = (
    ids: string[],
    codeMap: Map<string, string>,
  ): string | undefined => {
    const codes = ids.map((id) => codeMap.get(id)).filter((c): c is string => Boolean(c));
    return codes.length > 0 ? codes.join(',') : undefined;
  };

  const setTypeFilter = (ids: string[]): void => {
    const next = idsToSearchString(ids, typeCodeById);
    void navigate({
      to: '/admin/patterns',
      // `exactOptionalPropertyTypes` rejects `{ key: undefined }`, so omit
      // empty keys by destructuring rather than reassigning to undefined.
      // Clearing the type filter also clears any subtype (subtypes only
      // make sense when their parent type is selected).
      search: (prev) => {
        const { type: _t, subtype: _s, ...rest } = prev;
        return {
          ...rest,
          ...(next ? { type: next } : {}),
          ...(next && _s ? { subtype: _s } : {}),
        };
      },
    });
  };
  const setSubtypeFilter = (ids: string[]): void => {
    const next = idsToSearchString(ids, subtypeCodeById);
    void navigate({
      to: '/admin/patterns',
      search: (prev) => {
        const { subtype: _s, ...rest } = prev;
        return {
          ...rest,
          ...(next ? { subtype: next } : {}),
        };
      },
    });
  };

  const onNew = (): void => {
    void navigate({ to: '/admin/patterns/new' });
  };
  const onRowClick = (row: Pattern): void => {
    void navigate({
      to: '/admin/patterns/$patternId',
      params: { patternId: row.id },
    });
  };
  const onDelete = (row: Pattern): void => {
    if (window.confirm(t('admin.patterns.deleteConfirm'))) {
      deleteMut.mutate(row.id);
    }
  };

  return (
    <main className="container py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t('admin.patterns.title')}
          </h1>
          <p className="mt-2 max-w-2xl text-on-surface-variant">
            {t('admin.patterns.description')}
          </p>
        </div>
        <Button onClick={onNew} className="gap-2">
          <Plus className="size-4" aria-hidden />
          {t('admin.patterns.newPattern')}
        </Button>
      </div>

      <section
        aria-label={t('patterns.filters.patternType')}
        className="mt-6 space-y-3"
      >
        <ClassificationMultiSelect
          options={typeOpts.data ?? []}
          isPending={typeOpts.isPending}
          selectedIds={typeIds}
          onChange={setTypeFilter}
          label={t('patterns.filters.patternType')}
        />
        {showSubtype ? (
          <ClassificationMultiSelect
            options={subtypeOpts.data ?? []}
            isPending={subtypeOpts.isPending}
            selectedIds={subtypeIds}
            onChange={setSubtypeFilter}
            label={t('patterns.filters.hokeiSubtype')}
          />
        ) : null}
      </section>

      <section className="mt-8">
        <ul className="space-y-2">
          {patterns.map((row) => (
            <PatternListItem
              key={row.id}
              pattern={row}
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
