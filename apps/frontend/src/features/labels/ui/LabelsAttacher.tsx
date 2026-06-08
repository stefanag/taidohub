import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { TaggableType } from '@repo/contracts/labels';

import {
  useAttachCategoryMutation,
  useAttachTagMutation,
  useAttachmentsQuery,
  useCategoriesQuery,
  useDetachCategoryMutation,
  useDetachTagMutation,
  useTagsQuery,
} from '@/entities/label';
import { Button } from '@/shared/ui';

interface LabelsAttacherProps {
  targetType: TaggableType;
  targetId: string;
}

/**
 * Per-target labels editor: lists the tags and categories currently attached
 * to a `(targetType, targetId)` pair and lets the caller add or remove them.
 *
 * Source of truth is the server: the component is a thin shell over the
 * Labels entity's React-Query hooks. The mutations invalidate the same query
 * keys they read from, so the displayed state always reconciles after a
 * round-trip without any local optimistic state.
 *
 * Sibling/cousin of `<LabelsFilterBar>`: similar visual grammar (removable
 * pill buttons + a "+ add" native select) but writes to the attachment
 * endpoints instead of URL search state.
 */
export function LabelsAttacher({
  targetType,
  targetId,
}: LabelsAttacherProps): React.ReactElement {
  const { t } = useTranslation();
  const { data: attachments } = useAttachmentsQuery(targetType, targetId);
  const { data: tags = [] } = useTagsQuery();
  const { data: cats = [] } = useCategoriesQuery();

  const attachTag = useAttachTagMutation();
  const detachTag = useDetachTagMutation();
  const attachCat = useAttachCategoryMutation();
  const detachCat = useDetachCategoryMutation();

  const attachedTagIds = new Set(
    (attachments?.tags ?? []).map((a) => a.tagId),
  );
  const attachedCatIds = new Set(
    (attachments?.categories ?? []).map((a) => a.categoryId),
  );

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-on-surface-variant">
        {t('labels.attach.tag')}
      </h3>
      <div className="flex flex-wrap items-center gap-1">
        {(attachments?.tags ?? []).map((att) => {
          const tag = tags.find((x) => x.id === att.tagId);
          if (!tag) return null;
          return (
            <Button
              key={att.id}
              size="sm"
              variant="outline"
              onClick={() => detachTag.mutate(att.id)}
            >
              ✕ {tag.name}
            </Button>
          );
        })}
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) {
              attachTag.mutate({
                tagId: e.target.value,
                targetType,
                targetId,
              });
            }
          }}
          aria-label={t('labels.attach.tag')}
          className="rounded-md border px-2 py-1 text-sm"
        >
          <option value="">+ {t('labels.attach.tag')}</option>
          {tags
            .filter((tag) => !attachedTagIds.has(tag.id))
            .map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
        </select>
      </div>

      <h3 className="text-sm font-semibold text-on-surface-variant">
        {t('labels.attach.category')}
      </h3>
      <div className="flex flex-wrap items-center gap-1">
        {(attachments?.categories ?? []).map((att) => {
          const cat = cats.find((c) => c.id === att.categoryId);
          if (!cat) return null;
          const parent = cats.find((c) => c.id === cat.parentId);
          return (
            <Button
              key={att.id}
              size="sm"
              variant="outline"
              onClick={() => detachCat.mutate(att.id)}
            >
              ✕ {parent ? `${parent.name} › ${cat.name}` : cat.name}
            </Button>
          );
        })}
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) {
              attachCat.mutate({
                categoryId: e.target.value,
                targetType,
                targetId,
              });
            }
          }}
          aria-label={t('labels.attach.category')}
          className="rounded-md border px-2 py-1 text-sm"
        >
          <option value="">+ {t('labels.attach.category')}</option>
          {cats
            .filter((cat) => !attachedCatIds.has(cat.id))
            .map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.parentId
                  ? `${cats.find((c) => c.id === cat.parentId)?.name ?? '?'} › ${cat.name}`
                  : cat.name}
              </option>
            ))}
        </select>
      </div>
    </section>
  );
}
