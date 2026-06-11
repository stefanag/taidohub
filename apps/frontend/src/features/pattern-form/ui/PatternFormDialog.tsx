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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  Input,
  Label,
} from '@/shared/ui';

const ROOT_PATTERN_TYPE: RootCode = 'pattern_type';
const ROOT_HOKEI_SUBTYPE: RootCode = 'hokei_subtype';

export interface PatternFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Set when editing; undefined when creating. */
  pattern?: Pattern;
}

/**
 * Create / edit modal for Patterns. Mirrors TechniqueFormDialog's structure
 * with two key deltas:
 *   1. Only two taxonomy pickers: `pattern_type` (required) plus a conditional
 *      `hokei_subtype` picker that only renders when a `hokei` `pattern_type`
 *      chip is selected.
 *   2. `officialBodyOrgId` is exposed as a free-text uuid input (Phase 2
 *      spec §9.7 — a proper org picker is polish for a later phase).
 *
 * When the hokei chip is deselected we clear any subtype state so we don't
 * submit stale ids on the next save.
 */
export function PatternFormDialog({
  open,
  onOpenChange,
  pattern,
}: PatternFormDialogProps): React.ReactElement {
  const { t } = useTranslation();
  const isEdit = !!pattern;

  const typeOpts = useClassificationCategoriesByRootQuery(ROOT_PATTERN_TYPE);
  const subtypeOpts = useClassificationCategoriesByRootQuery(
    ROOT_HOKEI_SUBTYPE,
  );

  const initialByRoot = React.useCallback(
    (root: 'pattern_type' | 'hokei_subtype'): string[] =>
      pattern?.classificationsByRoot[root].map((c) => c.id) ?? [],
    [pattern],
  );

  const [typeIds, setTypeIds] = React.useState<string[]>(
    initialByRoot('pattern_type'),
  );
  const [subtypeIds, setSubtypeIds] = React.useState<string[]>(
    initialByRoot('hokei_subtype'),
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

  // Reseed when the dialog reopens against a different pattern.
  React.useEffect(() => {
    if (!open) return;
    setTypeIds(initialByRoot('pattern_type'));
    setSubtypeIds(initialByRoot('hokei_subtype'));
    setNameJa(pattern?.nameJa ?? '');
    setNameRomaji(pattern?.nameRomaji ?? '');
    setNameSv(pattern?.nameSv ?? '');
    setNameEn(pattern?.nameEn ?? '');
    setNameFi(pattern?.nameFi ?? '');
    setDescriptionSv(pattern?.descriptionSv ?? '');
    setDescriptionEn(pattern?.descriptionEn ?? '');
    setDescriptionFi(pattern?.descriptionFi ?? '');
    setOfficialBodyOrgId(pattern?.officialBodyOrgId ?? '');
    setSortOrder(pattern?.sortOrder ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pattern?.id]);

  const hokeiTypeId = React.useMemo(
    () => typeOpts.data?.find((o) => o.code === 'hokei')?.id,
    [typeOpts.data],
  );
  const showSubtype =
    Boolean(hokeiTypeId) && typeIds.includes(hokeiTypeId!);

  // Clear subtype state when the picker hides so we don't submit stale ids.
  React.useEffect(() => {
    if (!showSubtype && subtypeIds.length > 0) setSubtypeIds([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSubtype]);

  const createMut = useCreatePatternMutation();
  const updateMut = useUpdatePatternMutation();
  const pending = createMut.isPending || updateMut.isPending;

  const classificationIds = [
    ...typeIds,
    ...(showSubtype ? subtypeIds : []),
  ];
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
        { onSuccess: () => onOpenChange(false) },
      );
    } else {
      createMut.mutate(input, {
        onSuccess: () => onOpenChange(false),
      });
    }
  };

  const textareaClass =
    'w-full rounded-sm border border-outline-variant/40 bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-secondary';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="md:min-h-[40rem] md:grid-rows-[auto_1fr] max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? t('patterns.form.title', { defaultValue: 'Edit pattern' })
              : t('patterns.form.newTitle', { defaultValue: 'New pattern' })}
          </DialogTitle>
        </DialogHeader>

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

          <DialogFooter className="mt-auto">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {t('common.save', { defaultValue: 'Save' })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
