import { useNavigate } from '@tanstack/react-router';
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
 * Admin technique catalogue page (sysadmin-only — the route guard layers
 * a sysadmin check on top of the `_app` session check). The "New technique"
 * button navigates to `/admin/techniques/new`; the per-row Edit action
 * navigates to `/admin/techniques/$techniqueId`. Delete is `window.confirm`
 * + `useDeleteTechniqueMutation` — kept inline because it's destructive and
 * cheaper to confirm than to route.
 *
 * Rows render via the reusable `TechniqueListItem`.
 */
export function AdminTechniquesPage(): React.ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [typeIds, setTypeIds] = React.useState<string[]>([]);
  const [sotaiIds, setSotaiIds] = React.useState<string[]>([]);
  const [attackIds, setAttackIds] = React.useState<string[]>([]);

  const filterIds = React.useMemo(
    () => [...typeIds, ...sotaiIds, ...attackIds],
    [typeIds, sotaiIds, attackIds],
  );
  const { data: techniques = [] } = useTechniquesQuery(filterIds);
  const deleteMut = useDeleteTechniqueMutation();

  const typeOpts = useClassificationCategoriesByRootQuery('technique_type');
  const sotaiOpts = useClassificationCategoriesByRootQuery('sotai_category');
  const attackOpts = useClassificationCategoriesByRootQuery('attack_type');

  const onNew = (): void => {
    void navigate({ to: '/admin/techniques/new' });
  };
  const onEdit = (row: Technique): void => {
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
          onChange={setTypeIds}
          label={t('techniques.filters.techniqueType')}
        />
        <ClassificationMultiSelect
          options={sotaiOpts.data ?? []}
          isPending={sotaiOpts.isPending}
          selectedIds={sotaiIds}
          onChange={setSotaiIds}
          label={t('techniques.filters.sotaiCategory')}
        />
        <ClassificationMultiSelect
          options={attackOpts.data ?? []}
          isPending={attackOpts.isPending}
          selectedIds={attackIds}
          onChange={setAttackIds}
          label={t('techniques.filters.attackType')}
        />
      </section>

      <section className="mt-8">
        <ul className="space-y-2">
          {techniques.map((row) => (
            <TechniqueListItem
              key={row.id}
              technique={row}
              onEdit={onEdit}
              onDelete={onDelete}
              isDeleting={deleteMut.isPending}
            />
          ))}
        </ul>
      </section>
    </main>
  );
}
