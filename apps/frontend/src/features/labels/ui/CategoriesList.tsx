import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  useCategoriesQuery,
  useCreateCategoryMutation,
  useDeleteCategoryMutation,
  useUpdateCategoryMutation,
} from '@/entities/label';
import { Button, Input } from '@/shared/ui';

interface CategoryLike {
  id: string;
  name: string;
  parentId: string | null;
  organisationId: string | null;
}

interface CategoriesListProps {
  /**
   * Whether the viewer can edit global (organisationId === null) categories
   * and create new globals. Lifted to the page so this feature does not have
   * to import from a sibling feature (`@/features/auth-by-email`).
   */
  isSysadmin: boolean;
  /**
   * When true, render the sysadmin-focused "globals only" variant: hides the
   * org-scoped section, hides the Global checkbox (every create is global),
   * and locks new categories to `global: true`. Used by `/admin/labels`.
   */
  globalsOnly?: boolean;
}

/**
 * Category admin surface. Default variant shows both org-scoped and global
 * trees; pass `globalsOnly` for the sysadmin admin route which manages only
 * the global registry.
 */
export function CategoriesList({
  isSysadmin,
  globalsOnly = false,
}: CategoriesListProps): React.ReactElement {
  const { t } = useTranslation();

  const { data: cats = [], isLoading } = useCategoriesQuery();
  const createMut = useCreateCategoryMutation();
  const updateMut = useUpdateCategoryMutation();
  const deleteMut = useDeleteCategoryMutation();

  const [name, setName] = React.useState('');
  const [global, setGlobal] = React.useState(false);
  const [parentId, setParentId] = React.useState<string | null>(null);
  const effectiveGlobal = globalsOnly ? true : global;

  const orgScoped = cats.filter((c) => c.organisationId !== null);
  const globals = cats.filter((c) => c.organisationId === null);

  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    if (!name.trim()) return;
    createMut.mutate(
      { name, global: effectiveGlobal, parentId },
      {
        onSuccess: () => {
          setName('');
          setGlobal(false);
          setParentId(null);
        },
      },
    );
  };

  if (isLoading) return <p>{t('common.loading')}</p>;

  const renderSection = (
    rows: CategoryLike[],
    canEditDefault: boolean,
  ): React.ReactElement => {
    const roots = rows.filter((r) => r.parentId === null);
    const childrenOf = (id: string): CategoryLike[] =>
      rows.filter((r) => r.parentId === id);

    return (
      <ul className="mt-2 space-y-1">
        {roots.map((root) => (
          <li key={root.id}>
            <Row
              cat={root}
              canEdit={canEditDefault}
              onRename={(next) =>
                updateMut.mutate({ id: root.id, input: { name: next } })
              }
              onDelete={() => deleteMut.mutate(root.id)}
              onAddSub={() => setParentId(root.id)}
            />
            <ul className="ml-6 mt-1 space-y-1">
              {childrenOf(root.id).map((child) => (
                <li key={child.id}>
                  <Row
                    cat={child}
                    canEdit={canEditDefault}
                    onRename={(next) =>
                      updateMut.mutate({ id: child.id, input: { name: next } })
                    }
                    onDelete={() => deleteMut.mutate(child.id)}
                  />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="flex items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={
            parentId
              ? t('settings.labels.addSubcategory')
              : t('settings.labels.addCategory')
          }
          aria-label={
            parentId
              ? t('settings.labels.addSubcategory')
              : t('settings.labels.addCategory')
          }
        />
        {parentId ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setParentId(null)}
          >
            {t('common.cancel')}
          </Button>
        ) : null}
        {isSysadmin && !globalsOnly ? (
          <label className="inline-flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={global}
              onChange={(e) => setGlobal(e.target.checked)}
            />
            {t('settings.labels.global')}
          </label>
        ) : null}
        <Button type="submit" disabled={createMut.isPending}>
          {t('common.save')}
        </Button>
      </form>

      {globalsOnly ? null : (
        <section>
          <h2 className="text-sm font-semibold text-on-surface-variant">
            {t('settings.labels.orgScoped')}
          </h2>
          {renderSection(orgScoped, true)}
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold text-on-surface-variant">
          {t('settings.labels.global')}
        </h2>
        {renderSection(globals, isSysadmin)}
      </section>
    </div>
  );
}

interface RowProps {
  cat: CategoryLike;
  canEdit: boolean;
  onRename: (name: string) => void;
  onDelete: () => void;
  onAddSub?: () => void;
}

function Row({
  cat,
  canEdit,
  onRename,
  onDelete,
  onAddSub,
}: RowProps): React.ReactElement {
  const { t } = useTranslation();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(cat.name);

  if (editing && canEdit) {
    return (
      <div className="flex items-center gap-2">
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} />
        <Button
          size="sm"
          onClick={() => {
            onRename(draft);
            setEditing(false);
          }}
        >
          {t('common.save')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setEditing(false);
            setDraft(cat.name);
          }}
        >
          {t('common.cancel')}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="flex-1">{cat.name}</span>
      {canEdit ? (
        <>
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            {t('common.edit')}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete}>
            {t('common.delete')}
          </Button>
          {onAddSub ? (
            <Button size="sm" variant="ghost" onClick={onAddSub}>
              + {t('settings.labels.addSubcategory')}
            </Button>
          ) : null}
        </>
      ) : (
        <span className="text-xs text-on-surface-variant">
          {t('settings.labels.readOnly')}
        </span>
      )}
    </div>
  );
}
