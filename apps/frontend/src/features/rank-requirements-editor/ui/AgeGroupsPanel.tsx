import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  ageGroupLabel,
  useRequirementsForSetQuery,
  useSetAgeGroupsMutation,
} from '@/entities/rank-requirement';
import { HttpError } from '@/shared/api';
import { Button, Input, Label } from '@/shared/ui';

export interface AgeGroupsPanelProps {
  rankId: string;
  setId: string;
  /** The tab being edited: null for all ages, else an age group id. */
  selected: string | null;
  onSelect: (ageGroupId: string | null) => void;
}

interface Row {
  id?: string;
  ageFrom: string;
  ageTo: string;
}

const toRow = (g: { id: string; ageFrom: number | null; ageTo: number | null }): Row => ({
  id: g.id,
  ageFrom: g.ageFrom === null ? '' : String(g.ageFrom),
  ageTo: g.ageTo === null ? '' : String(g.ageTo),
});

const SERVER_ERRORS: Record<string, string> = {
  AGE_GROUPS_OVERLAP: 'admin.rankRequirements.ageGroups.errors.overlap',
  BASE_REQUIREMENT_REQUIRED: 'admin.rankRequirements.ageGroups.errors.baseRequired',
  AGE_GROUPS_NOT_ALLOWED: 'admin.rankRequirements.ageGroups.errors.notAllowed',
};

/**
 * Age groups of a kyu or dan rank in a set: one tab per group plus "All
 * ages" (the base requirement), and an editor for the groups themselves. A
 * new group starts with a copy of the requirement for all ages; removing a
 * group removes its requirement.
 */
export function AgeGroupsPanel({
  rankId,
  setId,
  selected,
  onSelect,
}: AgeGroupsPanelProps): React.ReactElement {
  const { t } = useTranslation();
  const base = useRequirementsForSetQuery(rankId, setId);
  const save = useSetAgeGroupsMutation();
  const groups = base.data?.ageGroups ?? [];
  const [editing, setEditing] = React.useState(false);
  const [rows, setRows] = React.useState<Row[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const startEditing = () => {
    setRows(groups.map(toRow));
    setError(null);
    setEditing(true);
  };

  const parse = (v: string): number | null => (v.trim() === '' ? null : Number(v));

  const onSave = async () => {
    setError(null);
    const parsed = rows.map((r) => ({
      ...(r.id ? { id: r.id } : {}),
      ageFrom: parse(r.ageFrom),
      ageTo: parse(r.ageTo),
    }));
    const invalid = parsed.some(
      (g) =>
        (g.ageFrom === null && g.ageTo === null) ||
        [g.ageFrom, g.ageTo].some(
          (v) => v !== null && (!Number.isInteger(v) || v < 0 || v > 120),
        ) ||
        (g.ageFrom !== null && g.ageTo !== null && g.ageFrom > g.ageTo),
    );
    if (invalid) {
      setError(t('admin.rankRequirements.ageGroups.errors.invalid'));
      return;
    }
    try {
      const result = await save.mutateAsync({ rankId, body: { setId, groups: parsed } });
      setEditing(false);
      if (selected && !result.ageGroups.some((g) => g.id === selected)) onSelect(null);
    } catch (err) {
      const code = err instanceof HttpError ? err.payload.code : undefined;
      setError(t(SERVER_ERRORS[code ?? ''] ?? 'common.unknownError'));
    }
  };

  const tab = (id: string | null, label: string) => (
    <Button
      key={id ?? 'base'}
      type="button"
      size="sm"
      variant={selected === id ? 'default' : 'outline'}
      aria-pressed={selected === id}
      onClick={() => onSelect(id)}
    >
      {label}
    </Button>
  );

  return (
    <section
      aria-labelledby="age-groups-heading"
      className="space-y-3 rounded-md border border-outline-variant/40 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="age-groups-heading" className="text-base font-semibold">
          {t('admin.rankRequirements.ageGroups.title')}
        </h2>
        {editing ? null : (
          <Button type="button" size="sm" variant="ghost" onClick={startEditing}>
            {t('admin.rankRequirements.ageGroups.manage')}
          </Button>
        )}
      </div>
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label={t('admin.rankRequirements.ageGroups.title')}
      >
        {tab(null, t('admin.rankRequirements.ageGroups.allAges'))}
        {groups.map((g) => tab(g.id, ageGroupLabel(g, t)))}
      </div>
      <p className="text-sm text-on-surface-variant">
        {selected === null
          ? t('admin.rankRequirements.ageGroups.baseHint')
          : t('admin.rankRequirements.ageGroups.variantHint')}
      </p>

      {editing ? (
        <div className="space-y-3 border-t pt-3" data-testid="age-groups-editor">
          <p className="text-sm text-on-surface-variant">
            {t('admin.rankRequirements.ageGroups.editorHint')}
          </p>
          {rows.map((row, i) => (
            <div key={row.id ?? `new-${i}`} className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor={`ag-from-${i}`}>{t('admin.rankRequirements.ageGroups.from')}</Label>
                <Input
                  id={`ag-from-${i}`}
                  type="number"
                  min={0}
                  max={120}
                  className="w-24"
                  value={row.ageFrom}
                  onChange={(e) =>
                    setRows((rs) =>
                      rs.map((r, j) => (j === i ? { ...r, ageFrom: e.target.value } : r)),
                    )
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`ag-to-${i}`}>{t('admin.rankRequirements.ageGroups.to')}</Label>
                <Input
                  id={`ag-to-${i}`}
                  type="number"
                  min={0}
                  max={120}
                  className="w-24"
                  value={row.ageTo}
                  onChange={(e) =>
                    setRows((rs) =>
                      rs.map((r, j) => (j === i ? { ...r, ageTo: e.target.value } : r)),
                    )
                  }
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
              >
                {t('admin.rankRequirements.ageGroups.remove')}
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setRows((rs) => [...rs, { ageFrom: '', ageTo: '' }])}
            >
              {t('admin.rankRequirements.ageGroups.add')}
            </Button>
            <Button type="button" size="sm" disabled={save.isPending} onClick={() => void onSave()}>
              {t('common.save')}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              {t('common.cancel')}
            </Button>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
