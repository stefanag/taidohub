import { useNavigate, useSearch } from '@tanstack/react-router';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { Pattern } from '@repo/contracts/patterns';

import { useClassificationCodeFilter } from '@/entities/classification-category';
import {
  useDeletePatternMutation,
  usePatternsQuery,
} from '@/entities/pattern';
import { PatternListItem } from '@/features/pattern-list-item';
import { ClassificationMultiSelect, ResourceAdminListPage } from '@/shared/ui';

/**
 * Admin pattern catalogue list page (sysadmin-only — the layout
 * route carries the guard once). Filter state lives in the URL as
 * comma-separated **classification codes** under `?type=…&subtype=…`;
 * resolution to UUIDs happens at render time via the classification
 * queries. Codes are the user-stable handle, so the URL stays
 * human-readable and survives classification ID changes.
 *
 * Row click → view page. Delete is inline (`window.confirm` +
 * mutation). "New pattern" navigates to the create page.
 *
 * The header, filter section, and list wrapper come from
 * `<ResourceAdminListPage>` (Chunk 2.3); the code↔id bridge comes
 * from `useClassificationCodeFilter()`. The only pattern-specific
 * piece is the conditional `hokei_subtype` filter — it only renders
 * when `pattern_type` includes `hokei` so subtypes can't be selected
 * for non-hokei patterns.
 */
type Search = { type?: string; subtype?: string };

export function AdminPatternsListPage(): React.ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const search = useSearch({ from: '/_app/admin/patterns/' }) as Search;

  const type = useClassificationCodeFilter('pattern_type');
  const subtype = useClassificationCodeFilter('hokei_subtype');

  const typeIds = React.useMemo(
    () => type.codesToIds(search.type),
    [type, search.type],
  );
  const subtypeIds = React.useMemo(
    () => subtype.codesToIds(search.subtype),
    [subtype, search.subtype],
  );

  const hokeiTypeId = React.useMemo(
    () => type.options.find((o) => o.code === 'hokei')?.id,
    [type.options],
  );
  const showSubtype = Boolean(hokeiTypeId) && typeIds.includes(hokeiTypeId!);

  const filterIds = React.useMemo(
    () => [...typeIds, ...(showSubtype ? subtypeIds : [])],
    [typeIds, subtypeIds, showSubtype],
  );
  const { data: patterns = [] } = usePatternsQuery(filterIds);
  const deleteMut = useDeletePatternMutation();

  const setTypeFilter = (ids: string[]): void => {
    const next = type.idsToCsv(ids);
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
    const next = subtype.idsToCsv(ids);
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
    <ResourceAdminListPage
      title={t('admin.patterns.title')}
      description={t('admin.patterns.description')}
      newAction={{
        label: t('admin.patterns.newPattern'),
        onClick: () => void navigate({ to: '/admin/patterns/new' }),
      }}
      filters={
        <>
          <ClassificationMultiSelect
            options={type.options}
            isPending={type.isPending}
            selectedIds={typeIds}
            onChange={setTypeFilter}
            label={t('patterns.filters.patternType')}
          />
          {showSubtype ? (
            <ClassificationMultiSelect
              options={subtype.options}
              isPending={subtype.isPending}
              selectedIds={subtypeIds}
              onChange={setSubtypeFilter}
              label={t('patterns.filters.hokeiSubtype')}
            />
          ) : null}
        </>
      }
    >
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
    </ResourceAdminListPage>
  );
}
