import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  useCreateTagMutation,
  useDeleteTagMutation,
  useTagsQuery,
  useUpdateTagMutation,
} from '@/entities/labels';
import { useSession } from '@/features/auth-by-email';
import { Button, Input } from '@/shared/ui';

/**
 * Tag admin surface. Splits the loaded tag list into two sections:
 *   1. Org-scoped (organisationId !== null) — editable for any signed-in user.
 *   2. Globals  (organisationId === null) — editable only when the current
 *      session's role === 'sysadmin'. The same "global" checkbox in the
 *      create form is also gated to sysadmins so non-sysadmins can't even
 *      attempt to create a global (the backend re-checks).
 */
export function TagsList(): React.ReactElement {
  const { t } = useTranslation();
  const session = useSession();
  const role = (session.data?.user as { role?: string } | undefined)?.role;
  const isSysadmin = role === 'sysadmin';

  const { data: tags = [], isLoading } = useTagsQuery();
  const createMut = useCreateTagMutation();
  const updateMut = useUpdateTagMutation();
  const deleteMut = useDeleteTagMutation();

  const [name, setName] = React.useState('');
  const [global, setGlobal] = React.useState(false);

  const orgScoped = tags.filter((tag) => tag.organisationId !== null);
  const globals = tags.filter((tag) => tag.organisationId === null);

  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    if (!name.trim()) return;
    createMut.mutate(
      { name, global },
      {
        onSuccess: () => {
          setName('');
          setGlobal(false);
        },
      },
    );
  };

  if (isLoading) return <p>{t('common.loading')}</p>;

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="flex items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('settings.labels.addTag')}
          aria-label={t('settings.labels.addTag')}
        />
        {isSysadmin ? (
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

      <section>
        <h2 className="text-sm font-semibold text-on-surface-variant">
          {t('settings.labels.orgScoped')} ({orgScoped.length})
        </h2>
        <ul className="mt-2 space-y-1">
          {orgScoped.map((tag) => (
            <TagRow
              key={tag.id}
              tag={tag}
              canEdit
              onRename={(next) =>
                updateMut.mutate({ id: tag.id, input: { name: next } })
              }
              onDelete={() => deleteMut.mutate(tag.id)}
            />
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-on-surface-variant">
          {t('settings.labels.global')} ({globals.length})
        </h2>
        <ul className="mt-2 space-y-1">
          {globals.map((tag) => (
            <TagRow
              key={tag.id}
              tag={tag}
              canEdit={isSysadmin}
              onRename={(next) =>
                updateMut.mutate({ id: tag.id, input: { name: next } })
              }
              onDelete={() => deleteMut.mutate(tag.id)}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}

interface TagRowProps {
  tag: { id: string; name: string };
  canEdit: boolean;
  onRename: (name: string) => void;
  onDelete: () => void;
}

function TagRow({
  tag,
  canEdit,
  onRename,
  onDelete,
}: TagRowProps): React.ReactElement {
  const { t } = useTranslation();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(tag.name);

  if (editing && canEdit) {
    return (
      <li className="flex items-center gap-2">
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
            setDraft(tag.name);
          }}
        >
          {t('common.cancel')}
        </Button>
      </li>
    );
  }
  return (
    <li className="flex items-center gap-2">
      <span className="flex-1">{tag.name}</span>
      {canEdit ? (
        <>
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            {t('common.edit')}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete}>
            {t('common.delete')}
          </Button>
        </>
      ) : (
        <span className="text-xs text-on-surface-variant">
          {t('settings.labels.readOnly')}
        </span>
      )}
    </li>
  );
}
