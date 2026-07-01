import * as React from 'react';
import { Controller, type Control, type UseFormRegister } from 'react-hook-form';
import { useTranslation } from 'react-i18next';


import { EntityMultiSelect, type EntityOption } from './EntityMultiSelect.js';

import type { RankRequirementsFormValues } from './RankRequirementsEditor.js';

import { Button, Card, CardContent, CardHeader, Input, Label } from '@/shared/ui';

export interface HokeiGroupEditorProps {
  /** Index within the `hokeiGroups` field array — also the read-only `groupOrder`. */
  index: number;
  control: Control<RankRequirementsFormValues>;
  register: UseFormRegister<RankRequirementsFormValues>;
  patternOptions: EntityOption[];
  isPatternsPending?: boolean;
  onRemove: (index: number) => void;
}

/**
 * One repeatable hokei group card, rendered by `RankRequirementsEditor`'s
 * `useFieldArray`. `groupOrder` is derived from `index` and rendered
 * read-only — it is NOT a free-editable field, it mirrors array position.
 *
 * `pickCount` is passed straight through to the server on submit; this
 * component does not clamp it against `patternIds.length` — clamping is a
 * server responsibility per `HokeiGroupInputSchema`'s doc comment.
 */
export function HokeiGroupEditor({
  index,
  control,
  register,
  patternOptions,
  isPatternsPending,
  onRemove,
}: HokeiGroupEditorProps): React.ReactElement {
  const { t } = useTranslation();

  return (
    <Card
      className="border border-outline-variant/60 p-4"
      data-testid={`hokei-group-${index}`}
    >
      <CardHeader className="mb-4 flex flex-row items-center justify-between">
        <span className="text-sm font-medium">
          {t('admin.rankRequirements.hokei.groupOrder', {
            defaultValue: 'Group {{order}}',
            order: index,
          })}
        </span>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={() => onRemove(index)}
        >
          {t('admin.rankRequirements.hokei.remove', { defaultValue: 'Remove group' })}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor={`hokei-${index}-pick-count`}>
              {t('admin.rankRequirements.hokei.pickCount', { defaultValue: 'Pick count' })}
            </Label>
            <Input
              id={`hokei-${index}-pick-count`}
              type="number"
              min={1}
              {...register(`hokeiGroups.${index}.pickCount`, { valueAsNumber: true })}
            />
          </div>

          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input
              type="checkbox"
              aria-label={t('admin.rankRequirements.hokei.isTested', {
                defaultValue: 'Tested',
              })}
              {...register(`hokeiGroups.${index}.isTested`)}
            />
            {t('admin.rankRequirements.hokei.isTested', { defaultValue: 'Tested' })}
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor={`hokei-${index}-label-en`}>
              {t('admin.rankRequirements.hokei.labelEn', { defaultValue: 'Label (EN)' })}
            </Label>
            <Input
              id={`hokei-${index}-label-en`}
              {...register(`hokeiGroups.${index}.labelEn`, {
                setValueAs: (v: string) => (v ? v : null),
              })}
            />
          </div>
          <div>
            <Label htmlFor={`hokei-${index}-label-fi`}>
              {t('admin.rankRequirements.hokei.labelFi', { defaultValue: 'Label (FI)' })}
            </Label>
            <Input
              id={`hokei-${index}-label-fi`}
              {...register(`hokeiGroups.${index}.labelFi`, {
                setValueAs: (v: string) => (v ? v : null),
              })}
            />
          </div>
          <div>
            <Label htmlFor={`hokei-${index}-label-sv`}>
              {t('admin.rankRequirements.hokei.labelSv', { defaultValue: 'Label (SV)' })}
            </Label>
            <Input
              id={`hokei-${index}-label-sv`}
              {...register(`hokeiGroups.${index}.labelSv`, {
                setValueAs: (v: string) => (v ? v : null),
              })}
            />
          </div>
        </div>

        <Controller
          control={control}
          name={`hokeiGroups.${index}.patternIds`}
          render={({ field }) => (
            <EntityMultiSelect
              options={patternOptions}
              {...(isPatternsPending !== undefined ? { isPending: isPatternsPending } : {})}
              selectedIds={field.value ?? []}
              onSelectedChange={(next) => field.onChange(next)}
              // Hokei groups have a single scope-level `isTested` flag (the
              // checkbox above) rather than a per-pattern tested flag, so no
              // `testedIds`/`onTestedChange` is passed — the chip renders
              // without the per-chip "Tested" toggle.
              label={t('admin.rankRequirements.hokei.patterns', {
                defaultValue: 'Patterns',
              })}
            />
          )}
        />
      </CardContent>
    </Card>
  );
}
