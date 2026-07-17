import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useClassificationCategoriesByRootQuery } from '@/entities/classification-category';
import {
  useCreatePatternMutation,
  useUpdatePatternMutation,
} from '@/entities/pattern';
import type { RootCode } from '@repo/contracts/classification-category';
import type { CreatePatternInput, Pattern } from '@repo/contracts/patterns';

import {
  Button,
  ClassificationMultiSelect,
  FormField,
  Input,
  Label,
} from '@/shared/ui';

const ROOT_PATTERN_TYPE: RootCode = 'pattern_type';
const ROOT_HOKEI_SUBTYPE: RootCode = 'hokei_subtype';

export interface PatternFormProps {
  /** Set when editing; undefined when creating. */
  pattern?: Pattern;
  /** Called after a successful create or update. */
  onSaved: () => void;
  /** Called when the user clicks Cancel. */
  onCancel: () => void;
}

/**
 * Page-embeddable create / edit form for Patterns. Local-state form (no
 * react-hook-form) to stay terse — the field count is small. The
 * `hokei_subtype` picker only renders when a `pattern_type=hokei` chip is
 * selected; when it's deselected we clear any subtype state so we don't
 * submit stale ids.
 */
export function PatternForm({
  pattern,
  onSaved,
  onCancel,
}: PatternFormProps): React.ReactElement {
  const { t } = useTranslation();
  const isEdit = !!pattern;

  const typeOpts = useClassificationCategoriesByRootQuery(ROOT_PATTERN_TYPE);
  const subtypeOpts = useClassificationCategoriesByRootQuery(ROOT_HOKEI_SUBTYPE);

  const [typeIds, setTypeIds] = React.useState<string[]>(
    pattern?.classificationsByRoot.pattern_type.map((c) => c.id) ?? [],
  );
  const [subtypeIds, setSubtypeIds] = React.useState<string[]>(
    pattern?.classificationsByRoot.hokei_subtype.map((c) => c.id) ?? [],
  );

  const [nameJa, setNameJa] = React.useState(pattern?.nameJa ?? '');
  const [nameRomaji, setNameRomaji] = React.useState(pattern?.nameRomaji ?? '');
  const [nameSv, setNameSv] = React.useState(pattern?.nameSv ?? '');
  const [nameEn, setNameEn] = React.useState(pattern?.nameEn ?? '');
  const [nameFi, setNameFi] = React.useState(pattern?.nameFi ?? '');
  const [descriptionSv, setDescriptionSv] = React.useState(
    pattern?.descriptionSv ?? '',
  );
  const [descriptionEn, setDescriptionEn] = React.useState(
    pattern?.descriptionEn ?? '',
  );
  const [descriptionFi, setDescriptionFi] = React.useState(
    pattern?.descriptionFi ?? '',
  );
  const [officialBodyOrgId, setOfficialBodyOrgId] = React.useState<string>(
    pattern?.officialBodyOrgId ?? '',
  );
  const [sortOrder, setSortOrder] = React.useState<number>(
    pattern?.sortOrder ?? 0,
  );

  const hokeiTypeId = React.useMemo(
    () => typeOpts.data?.find((o) => o.code === 'hokei')?.id,
    [typeOpts.data],
  );
  const showSubtype = Boolean(hokeiTypeId) && typeIds.includes(hokeiTypeId!);

  // Derive the effective subtype list inline instead of syncing via an
  // effect: subtypes only apply when the hokei type is picked. The user's
  // last subtype pick lives in `subtypeIds`; when the hokei type is
  // removed we render as if the list were empty. Re-picking hokei restores
  // the last selection, which is a mild UX improvement over the previous
  // "clear on toggle off" effect.
  const effectiveSubtypeIds = showSubtype ? subtypeIds : [];

  const createMut = useCreatePatternMutation();
  const updateMut = useUpdatePatternMutation();
  const pending = createMut.isPending || updateMut.isPending;

  const classificationIds = [...typeIds, ...effectiveSubtypeIds];
  const canSubmit =
    typeIds.length > 0 && nameRomaji.trim().length > 0 && !pending;

  const onSubmit = (event: React.SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!canSubmit) return;
    const trimmedOrg = officialBodyOrgId.trim();
    const input: CreatePatternInput = {
      classificationIds,
      isActive: pattern?.isActive ?? true,
      sortOrder,
      nameJa,
      nameRomaji,
      nameSv,
      nameEn,
      nameFi,
      descriptionSv,
      descriptionEn,
      descriptionFi,
      minRankId: pattern?.minRankId ?? null,
      organisationId: pattern?.createdByOrganisationId ?? null,
      officialBodyOrgId: trimmedOrg === '' ? null : trimmedOrg,
    };
    if (isEdit && pattern) {
      updateMut.mutate(
        { id: pattern.id, input },
        { onSuccess: () => onSaved() },
      );
    } else {
      createMut.mutate(input, { onSuccess: () => onSaved() });
    }
  };

  const textareaClass =
    'w-full rounded-sm border border-outline-variant/40 bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-secondary';

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <ClassificationMultiSelect
        options={typeOpts.data ?? []}
        isPending={typeOpts.isPending}
        selectedIds={typeIds}
        onChange={setTypeIds}
        label={t('patterns.filters.patternType', {
          defaultValue: 'Pattern type',
        })}
        required
      />
      {showSubtype ? (
        <ClassificationMultiSelect
          options={subtypeOpts.data ?? []}
          isPending={subtypeOpts.isPending}
          selectedIds={subtypeIds}
          onChange={setSubtypeIds}
          label={t('patterns.filters.hokeiSubtype', {
            defaultValue: 'Hokei subtype',
          })}
        />
      ) : null}

      <FormField>
        <Label htmlFor="pattern-romaji">
          {t('patterns.form.nameRomaji', { defaultValue: 'Romaji' })}
          <span aria-hidden="true"> *</span>
        </Label>
        <Input
          id="pattern-romaji"
          value={nameRomaji}
          onChange={(e) => setNameRomaji(e.target.value)}
          required
        />
      </FormField>

      <FormField>
        <Label htmlFor="pattern-ja">
          {t('patterns.form.nameJa', { defaultValue: 'Japanese' })}
        </Label>
        <Input
          id="pattern-ja"
          value={nameJa}
          onChange={(e) => setNameJa(e.target.value)}
        />
      </FormField>

      <FormField>
        <Label htmlFor="pattern-en">
          {t('patterns.form.nameEn', { defaultValue: 'English' })}
        </Label>
        <Input
          id="pattern-en"
          value={nameEn}
          onChange={(e) => setNameEn(e.target.value)}
        />
      </FormField>

      <FormField>
        <Label htmlFor="pattern-sv">
          {t('patterns.form.nameSv', { defaultValue: 'Swedish' })}
        </Label>
        <Input
          id="pattern-sv"
          value={nameSv}
          onChange={(e) => setNameSv(e.target.value)}
        />
      </FormField>

      <FormField>
        <Label htmlFor="pattern-fi">
          {t('patterns.form.nameFi', { defaultValue: 'Finnish' })}
        </Label>
        <Input
          id="pattern-fi"
          value={nameFi}
          onChange={(e) => setNameFi(e.target.value)}
        />
      </FormField>

      <FormField>
        <Label htmlFor="pattern-desc-en">
          {t('patterns.form.descriptionEn', {
            defaultValue: 'Description (EN)',
          })}
        </Label>
        <textarea
          id="pattern-desc-en"
          rows={3}
          className={textareaClass}
          value={descriptionEn}
          onChange={(e) => setDescriptionEn(e.target.value)}
        />
      </FormField>

      <FormField>
        <Label htmlFor="pattern-desc-sv">
          {t('patterns.form.descriptionSv', {
            defaultValue: 'Description (SV)',
          })}
        </Label>
        <textarea
          id="pattern-desc-sv"
          rows={3}
          className={textareaClass}
          value={descriptionSv}
          onChange={(e) => setDescriptionSv(e.target.value)}
        />
      </FormField>

      <FormField>
        <Label htmlFor="pattern-desc-fi">
          {t('patterns.form.descriptionFi', {
            defaultValue: 'Description (FI)',
          })}
        </Label>
        <textarea
          id="pattern-desc-fi"
          rows={3}
          className={textareaClass}
          value={descriptionFi}
          onChange={(e) => setDescriptionFi(e.target.value)}
        />
      </FormField>

      <FormField>
        <Label htmlFor="pattern-official-body-org">
          {t('patterns.form.officialBodyOrgId', {
            defaultValue: 'Official body org id',
          })}
        </Label>
        <Input
          id="pattern-official-body-org"
          value={officialBodyOrgId}
          onChange={(e) => setOfficialBodyOrgId(e.target.value)}
          placeholder="00000000-0000-0000-0000-000000000000"
        />
      </FormField>

      <FormField>
        <Label htmlFor="pattern-sort-order">
          {t('patterns.form.sortOrder', { defaultValue: 'Sort order' })}
        </Label>
        <Input
          id="pattern-sort-order"
          type="number"
          min={0}
          value={sortOrder}
          onChange={(e) =>
            setSortOrder(Number.parseInt(e.target.value, 10) || 0)
          }
        />
      </FormField>

      <div className="mt-2 flex items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          {t('common.cancel', { defaultValue: 'Cancel' })}
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          {t('common.save', { defaultValue: 'Save' })}
        </Button>
      </div>
    </form>
  );
}
