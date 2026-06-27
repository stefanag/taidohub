import { useNavigate, useSearch } from '@tanstack/react-router';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { Technique } from '@repo/contracts/techniques';

import { useClassificationCodeFilter } from '@/entities/classification-category';
import {
  useDeleteTechniqueMutation,
  useTechniquesQuery,
} from '@/entities/technique';
import { TechniqueListItem } from '@/features/technique-list-item';
import { ClassificationMultiSelect, ResourceAdminListPage } from '@/shared/ui';

/**
 * Admin technique catalogue list page. Filter state lives in the URL
 * as comma-separated classification **codes** under
 * `?type=…&sotai=…&attack=…`; resolution to UUIDs happens at render
 * time via the classification queries. Row click navigates to view;
 * Delete is inline.
 *
 * The header, filter section, and list wrapper all come from
 * `<ResourceAdminListPage>` (Chunk 2.3). The code↔id bridge for URL
 * state comes from `useClassificationCodeFilter()`. Both abstractions
 * are also used by `AdminPatternsListPage` — see them for the
 * minimal-rewrite migration that Chunk 2.4 follows.
 */
type Search = { type?: string; sotai?: string; attack?: string };

export function AdminTechniquesListPage(): React.ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const search = useSearch({ from: '/_app/admin/techniques/' }) as Search;

  const type = useClassificationCodeFilter('technique_type');
  const sotai = useClassificationCodeFilter('sotai_category');
  const attack = useClassificationCodeFilter('attack_type');

  const typeIds = React.useMemo(
    () => type.codesToIds(search.type),
    [type, search.type],
  );
  const sotaiIds = React.useMemo(
    () => sotai.codesToIds(search.sotai),
    [sotai, search.sotai],
  );
  const attackIds = React.useMemo(
    () => attack.codesToIds(search.attack),
    [attack, search.attack],
  );

  const filterIds = React.useMemo(
    () => [...typeIds, ...sotaiIds, ...attackIds],
    [typeIds, sotaiIds, attackIds],
  );
  const { data: techniques = [] } = useTechniquesQuery(filterIds);
  const deleteMut = useDeleteTechniqueMutation();

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
    <ResourceAdminListPage
      title={t('admin.techniques.title')}
      description={t('admin.techniques.description')}
      newAction={{
        label: t('admin.techniques.newTechnique'),
        onClick: () => void navigate({ to: '/admin/techniques/new' }),
      }}
      filters={
        <>
          <ClassificationMultiSelect
            options={type.options}
            isPending={type.isPending}
            selectedIds={typeIds}
            onChange={(ids) => updateKey('type', type.idsToCsv(ids))}
            label={t('techniques.filters.techniqueType')}
          />
          <ClassificationMultiSelect
            options={sotai.options}
            isPending={sotai.isPending}
            selectedIds={sotaiIds}
            onChange={(ids) => updateKey('sotai', sotai.idsToCsv(ids))}
            label={t('techniques.filters.sotaiCategory')}
          />
          <ClassificationMultiSelect
            options={attack.options}
            isPending={attack.isPending}
            selectedIds={attackIds}
            onChange={(ids) => updateKey('attack', attack.idsToCsv(ids))}
            label={t('techniques.filters.attackType')}
          />
        </>
      }
    >
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
    </ResourceAdminListPage>
  );
}
