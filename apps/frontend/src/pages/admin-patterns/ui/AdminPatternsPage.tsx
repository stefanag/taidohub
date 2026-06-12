import { Plus } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { Pattern } from '@repo/contracts/patterns';

import { useClassificationCategoriesByRootQuery } from '@/entities/classification-category';
import {
  useDeletePatternMutation,
  usePatternsQuery,
} from '@/entities/pattern';
import { useProgressListQuery } from '@/entities/progress';
import { PatternFormDialog } from '@/features/pattern-form';
import { ProgressEditorDialog } from '@/features/progress-editor-dialog';
import { Button, ClassificationMultiSelect, ProgressPill } from '@/shared/ui';

/**
 * Admin pattern catalogue page (sysadmin-only — the route guard layers a
 * sysadmin check on top of the `_app` session check). Mirrors the read-only
 * `PatternsPage` shape and adds:
 *
 *   - "New pattern" button → opens `PatternFormDialog` in create mode.
 *   - Per-row Edit (opens the dialog with the row preloaded) + Delete
 *     (window.confirm + `useDeletePatternMutation`).
 *
 * Filter bar: only the `pattern_type` picker is always rendered; the
 * `hokei_subtype` picker conditionally mounts when a chip resolving to
 * `code === 'hokei'` is selected — mirroring the form's `showSubtype`
 * logic so we never submit stale subtype ids.
 *
 * i18n keys land in Task 11 — until then the keys render as their raw
 * paths, which is acceptable for an admin-only surface.
 */
export function AdminPatternsPage(): React.ReactElement {
  const { t } = useTranslation();
  const [typeIds, setTypeIds] = React.useState<string[]>([]);
  const [subtypeIds, setSubtypeIds] = React.useState<string[]>([]);

  const typeOpts = useClassificationCategoriesByRootQuery('pattern_type');
  const subtypeOpts = useClassificationCategoriesByRootQuery('hokei_subtype');

  const hokeiTypeId = React.useMemo(
    () => typeOpts.data?.find((o) => o.code === 'hokei')?.id,
    [typeOpts.data],
  );
  const showSubtype = Boolean(hokeiTypeId) && typeIds.includes(hokeiTypeId!);

  React.useEffect(() => {
    if (!showSubtype && subtypeIds.length > 0) setSubtypeIds([]);
  }, [showSubtype, subtypeIds.length]);

  const filterIds = React.useMemo(
    () => [...typeIds, ...(showSubtype ? subtypeIds : [])],
    [typeIds, subtypeIds, showSubtype],
  );
  const { data: patterns = [] } = usePatternsQuery(filterIds);
  const deleteMut = useDeletePatternMutation();

  const { data: allProgress = [] } = useProgressListQuery();
  const progressByPatternId = React.useMemo(
    () =>
      new Map(
        allProgress
          .filter((p) => p.patternId)
          .map((p) => [p.patternId as string, p]),
      ),
    [allProgress],
  );

  const [progressEditing, setProgressEditing] = React.useState<{
    id: string;
    label: string;
  } | null>(null);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Pattern | undefined>(undefined);

  const onNew = (): void => {
    setEditing(undefined);
    setDialogOpen(true);
  };
  const onEdit = (row: Pattern): void => {
    setEditing(row);
    setDialogOpen(true);
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
          onChange={setTypeIds}
          label={t('patterns.filters.patternType')}
        />
        {showSubtype ? (
          <ClassificationMultiSelect
            options={subtypeOpts.data ?? []}
            isPending={subtypeOpts.isPending}
            selectedIds={subtypeIds}
            onChange={setSubtypeIds}
            label={t('patterns.filters.hokeiSubtype')}
          />
        ) : null}
      </section>

      <section className="mt-8">
        <ul className="space-y-2">
          {patterns.map((row) => (
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
              <div className="flex items-center gap-2">
                <ProgressPill
                  status={progressByPatternId.get(row.id)?.status ?? null}
                  onClick={() =>
                    setProgressEditing({
                      id: row.id,
                      label: row.nameRomaji,
                    })
                  }
                />
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

      <PatternFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        {...(editing ? { pattern: editing } : {})}
      />

      {progressEditing ? (
        <ProgressEditorDialog
          open
          onOpenChange={(o) => {
            if (!o) setProgressEditing(null);
          }}
          contentType="pattern"
          contentId={progressEditing.id}
          contentLabel={progressEditing.label}
        />
      ) : null}
    </main>
  );
}
