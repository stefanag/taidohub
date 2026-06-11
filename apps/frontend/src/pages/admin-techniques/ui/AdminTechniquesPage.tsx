import { Plus } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { Technique } from '@repo/contracts/techniques';

import {
  useDeleteTechniqueMutation,
  useTechniquesQuery,
} from '@/entities/technique';
import { TechniqueFormDialog } from '@/features/technique-form';
import { Button, ClassificationMultiSelect } from '@/shared/ui';

/**
 * Admin technique catalogue page (sysadmin-only — the route guard layers
 * a sysadmin check on top of the `_app` session check). Mirrors the
 * read-only `TechniquesPage` shape and adds:
 *
 *   - "New technique" button → opens `TechniqueFormDialog` in create mode.
 *   - Per-row Edit (opens the dialog with the row preloaded) + Delete
 *     (window.confirm + `useDeleteTechniqueMutation`).
 *
 * i18n keys land in Task 12 — until then the keys render as their raw
 * paths, which is acceptable for an admin-only surface.
 */
export function AdminTechniquesPage(): React.ReactElement {
  const { t } = useTranslation();
  const [typeIds, setTypeIds] = React.useState<string[]>([]);
  const [sotaiIds, setSotaiIds] = React.useState<string[]>([]);
  const [attackIds, setAttackIds] = React.useState<string[]>([]);

  const filterIds = React.useMemo(
    () => [...typeIds, ...sotaiIds, ...attackIds],
    [typeIds, sotaiIds, attackIds],
  );
  const { data: techniques = [] } = useTechniquesQuery(filterIds);
  const deleteMut = useDeleteTechniqueMutation();

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Technique | undefined>(
    undefined,
  );

  const onNew = (): void => {
    setEditing(undefined);
    setDialogOpen(true);
  };
  const onEdit = (row: Technique): void => {
    setEditing(row);
    setDialogOpen(true);
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
          rootCode="technique_type"
          selectedIds={typeIds}
          onChange={setTypeIds}
          label={t('techniques.filters.techniqueType')}
        />
        <ClassificationMultiSelect
          rootCode="sotai_category"
          selectedIds={sotaiIds}
          onChange={setSotaiIds}
          label={t('techniques.filters.sotaiCategory')}
        />
        <ClassificationMultiSelect
          rootCode="attack_type"
          selectedIds={attackIds}
          onChange={setAttackIds}
          label={t('techniques.filters.attackType')}
        />
      </section>

      <section className="mt-8">
        <ul className="space-y-2">
          {techniques.map((row) => (
            <li
              key={row.id}
              className="flex items-center justify-between rounded-lg border border-outline-variant p-3"
            >
              <div>
                <div className="font-medium">{row.nameRomaji}</div>
                <div className="text-xs text-on-surface-variant">
                  {row.classifications.map((c) => c.code).join(' · ')}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onEdit(row)}
                >
                  {t('common.edit')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onDelete(row)}
                  disabled={deleteMut.isPending}
                >
                  {t('common.delete')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <TechniqueFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        {...(editing ? { technique: editing } : {})}
      />
    </main>
  );
}
