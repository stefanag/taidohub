import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useCategoriesQuery, useTagsQuery } from '@/entities/label';
import { Button } from '@/shared/ui';

interface LabelsFilterBarProps {
  searchKey: { tag?: string[]; category?: string[] };
  onChange: (next: { tag?: string[]; category?: string[] }) => void;
}

/**
 * Compact filter row exposing the active tag and category selections for a
 * list page. Adding a value goes through a native `<select>` (one option per
 * row, "— select —" placeholder reset). Already-selected ids show up as
 * removable pill buttons so they can be cleared without re-opening the
 * dropdown.
 *
 * The component is pure: the source of truth is the `searchKey` prop the
 * route reads from the URL via `validateSearch`. `onChange` is invoked with
 * the full next state for both axes — the caller decides how to thread it
 * into navigation. Tag and category sets are tracked independently so
 * toggling one never resets the other.
 */
export function LabelsFilterBar({
  searchKey,
  onChange,
}: LabelsFilterBarProps): React.ReactElement {
  const { t } = useTranslation();
  const { data: tags = [] } = useTagsQuery();
  const { data: cats = [] } = useCategoriesQuery();

  const activeTag = new Set(searchKey.tag ?? []);
  const activeCat = new Set(searchKey.category ?? []);

  const toggle = (kind: 'tag' | 'category', id: string): void => {
    const current = kind === 'tag' ? new Set(activeTag) : new Set(activeCat);
    if (current.has(id)) current.delete(id);
    else current.add(id);
    onChange({
      tag: kind === 'tag' ? Array.from(current) : Array.from(activeTag),
      category:
        kind === 'category' ? Array.from(current) : Array.from(activeCat),
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-sm">{t('labels.filter.tag')}</label>
      <select
        value=""
        onChange={(e) => {
          if (e.target.value) toggle('tag', e.target.value);
        }}
        aria-label={t('labels.filter.tag')}
        className="rounded-md border px-2 py-1 text-sm"
      >
        <option value="">— select —</option>
        {tags.map((tag) => (
          <option key={tag.id} value={tag.id}>
            {tag.name}
          </option>
        ))}
      </select>

      <label className="ml-4 text-sm">{t('labels.filter.category')}</label>
      <select
        value=""
        onChange={(e) => {
          if (e.target.value) toggle('category', e.target.value);
        }}
        aria-label={t('labels.filter.category')}
        className="rounded-md border px-2 py-1 text-sm"
      >
        <option value="">— select —</option>
        {cats.map((cat) => (
          <option key={cat.id} value={cat.id}>
            {cat.parentId
              ? `${cats.find((c) => c.id === cat.parentId)?.name ?? '?'} › ${cat.name}`
              : cat.name}
          </option>
        ))}
      </select>

      {searchKey.tag?.length || searchKey.category?.length ? (
        <div className="ml-4 flex flex-wrap items-center gap-1">
          {searchKey.tag?.map((id) => {
            const tag = tags.find((tg) => tg.id === id);
            if (!tag) return null;
            return (
              <Button
                key={id}
                size="sm"
                variant="outline"
                onClick={() => toggle('tag', id)}
              >
                ✕ {tag.name}
              </Button>
            );
          })}
          {searchKey.category?.map((id) => {
            const cat = cats.find((c) => c.id === id);
            if (!cat) return null;
            const parent = cats.find((c) => c.id === cat.parentId);
            return (
              <Button
                key={id}
                size="sm"
                variant="outline"
                onClick={() => toggle('category', id)}
              >
                ✕ {parent ? `${parent.name} › ${cat.name}` : cat.name}
              </Button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
