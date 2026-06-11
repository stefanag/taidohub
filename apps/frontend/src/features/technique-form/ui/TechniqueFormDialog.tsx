import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useClassificationCategoriesByRootQuery } from '@/entities/classification-category';
import {
  useCreateTechniqueMutation,
  useUpdateTechniqueMutation,
} from '@/entities/technique';
import type {
  CreateTechniqueInput,
  Technique,
} from '@repo/contracts/techniques';
import type { RootCode } from '@repo/contracts/classification-category';

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

export interface TechniqueFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Set when editing; undefined when creating. */
  technique?: Technique;
}

const ROOT_TECHNIQUE_TYPE: RootCode = 'technique_type';
const ROOT_SOTAI: RootCode = 'sotai_category';
const ROOT_ATTACK: RootCode = 'attack_type';

/**
 * Create / edit modal for Techniques. Local-state form (no react-hook-form)
 * to stay terse — the field count is small and there is no cross-field
 * validation beyond "at least one technique_type chip + non-empty romaji".
 *
 * Layout follows the InviteUserDialog grid (`md:grid-rows-[auto_1fr]`) with
 * the footer pinned via `mt-auto` so the dialog has a consistent vertical
 * rhythm regardless of which optional name fields are filled in.
 */
export function TechniqueFormDialog({
  open,
  onOpenChange,
  technique,
}: TechniqueFormDialogProps): React.ReactElement {
  const { t } = useTranslation();
  const isEdit = !!technique;

  const typeOpts = useClassificationCategoriesByRootQuery(ROOT_TECHNIQUE_TYPE);
  const sotaiOpts = useClassificationCategoriesByRootQuery(ROOT_SOTAI);
  const attackOpts = useClassificationCategoriesByRootQuery(ROOT_ATTACK);

  const initialByRoot = React.useCallback(
    (root: 'technique_type' | 'sotai_category' | 'attack_type'): string[] =>
      technique?.classificationsByRoot[root].map((c) => c.id) ?? [],
    [technique],
  );

  const [typeIds, setTypeIds] = React.useState<string[]>(
    initialByRoot('technique_type'),
  );
  const [sotaiIds, setSotaiIds] = React.useState<string[]>(
    initialByRoot('sotai_category'),
  );
  const [attackIds, setAttackIds] = React.useState<string[]>(
    initialByRoot('attack_type'),
  );

  const [nameJa, setNameJa] = React.useState(technique?.nameJa ?? '');
  const [nameRomaji, setNameRomaji] = React.useState(
    technique?.nameRomaji ?? '',
  );
  const [nameSv, setNameSv] = React.useState(technique?.nameSv ?? '');
  const [nameEn, setNameEn] = React.useState(technique?.nameEn ?? '');
  const [nameFi, setNameFi] = React.useState(technique?.nameFi ?? '');
  const [descriptionSv, setDescriptionSv] = React.useState(
    technique?.descriptionSv ?? '',
  );
  const [descriptionEn, setDescriptionEn] = React.useState(
    technique?.descriptionEn ?? '',
  );
  const [descriptionFi, setDescriptionFi] = React.useState(
    technique?.descriptionFi ?? '',
  );
  const [isKihon, setIsKihon] = React.useState<boolean>(
    technique?.isKihon ?? false,
  );
  const [sortOrder, setSortOrder] = React.useState<number>(
    technique?.sortOrder ?? 0,
  );

  // Reseed when the dialog reopens against a different technique.
  React.useEffect(() => {
    if (!open) return;
    setTypeIds(initialByRoot('technique_type'));
    setSotaiIds(initialByRoot('sotai_category'));
    setAttackIds(initialByRoot('attack_type'));
    setNameJa(technique?.nameJa ?? '');
    setNameRomaji(technique?.nameRomaji ?? '');
    setNameSv(technique?.nameSv ?? '');
    setNameEn(technique?.nameEn ?? '');
    setNameFi(technique?.nameFi ?? '');
    setDescriptionSv(technique?.descriptionSv ?? '');
    setDescriptionEn(technique?.descriptionEn ?? '');
    setDescriptionFi(technique?.descriptionFi ?? '');
    setIsKihon(technique?.isKihon ?? false);
    setSortOrder(technique?.sortOrder ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, technique?.id]);

  const createMut = useCreateTechniqueMutation();
  const updateMut = useUpdateTechniqueMutation();
  const pending = createMut.isPending || updateMut.isPending;

  const classificationIds = [...typeIds, ...sotaiIds, ...attackIds];
  const canSubmit =
    typeIds.length > 0 && nameRomaji.trim().length > 0 && !pending;

  const onSubmit = (event: React.SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!canSubmit) return;
    const input: CreateTechniqueInput = {
      classificationIds,
      isKihon,
      isActive: technique?.isActive ?? true,
      sortOrder,
      nameJa,
      nameRomaji,
      nameSv,
      nameEn,
      nameFi,
      descriptionSv,
      descriptionEn,
      descriptionFi,
      minRankId: technique?.minRankId ?? null,
      organisationId: technique?.createdByOrganisationId ?? null,
    };
    if (isEdit && technique) {
      updateMut.mutate(
        { id: technique.id, input },
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
      <DialogContent className="max-h-[85vh] grid-rows-[auto_minmax(0,1fr)] max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? t('techniques.form.title', { defaultValue: 'Edit technique' })
              : t('techniques.form.newTitle', {
                  defaultValue: 'New technique',
                })}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col gap-4 overflow-y-auto pr-1" noValidate>
          <ClassificationMultiSelect
            options={typeOpts.data ?? []}
            isPending={typeOpts.isPending}
            selectedIds={typeIds}
            onChange={setTypeIds}
            label={t('techniques.filters.techniqueType', {
              defaultValue: 'Technique type',
            })}
            required
          />
          <ClassificationMultiSelect
            options={sotaiOpts.data ?? []}
            isPending={sotaiOpts.isPending}
            selectedIds={sotaiIds}
            onChange={setSotaiIds}
            label={t('techniques.filters.sotaiCategory', {
              defaultValue: 'Sotai category',
            })}
          />
          <ClassificationMultiSelect
            options={attackOpts.data ?? []}
            isPending={attackOpts.isPending}
            selectedIds={attackIds}
            onChange={setAttackIds}
            label={t('techniques.filters.attackType', {
              defaultValue: 'Attack type',
            })}
          />

          <FormField>
            <Label htmlFor="tech-romaji">
              {t('techniques.form.nameRomaji', { defaultValue: 'Romaji' })}
              <span aria-hidden="true"> *</span>
            </Label>
            <Input
              id="tech-romaji"
              value={nameRomaji}
              onChange={(e) => setNameRomaji(e.target.value)}
              required
            />
          </FormField>

          <FormField>
            <Label htmlFor="tech-ja">
              {t('techniques.form.nameJa', { defaultValue: 'Japanese' })}
            </Label>
            <Input
              id="tech-ja"
              value={nameJa}
              onChange={(e) => setNameJa(e.target.value)}
            />
          </FormField>

          <FormField>
            <Label htmlFor="tech-en">
              {t('techniques.form.nameEn', { defaultValue: 'English' })}
            </Label>
            <Input
              id="tech-en"
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
            />
          </FormField>

          <FormField>
            <Label htmlFor="tech-sv">
              {t('techniques.form.nameSv', { defaultValue: 'Swedish' })}
            </Label>
            <Input
              id="tech-sv"
              value={nameSv}
              onChange={(e) => setNameSv(e.target.value)}
            />
          </FormField>

          <FormField>
            <Label htmlFor="tech-fi">
              {t('techniques.form.nameFi', { defaultValue: 'Finnish' })}
            </Label>
            <Input
              id="tech-fi"
              value={nameFi}
              onChange={(e) => setNameFi(e.target.value)}
            />
          </FormField>

          <FormField>
            <Label htmlFor="tech-desc-en">
              {t('techniques.form.descriptionEn', {
                defaultValue: 'Description (EN)',
              })}
            </Label>
            <textarea
              id="tech-desc-en"
              rows={3}
              className={textareaClass}
              value={descriptionEn}
              onChange={(e) => setDescriptionEn(e.target.value)}
            />
          </FormField>

          <FormField>
            <Label htmlFor="tech-desc-sv">
              {t('techniques.form.descriptionSv', {
                defaultValue: 'Description (SV)',
              })}
            </Label>
            <textarea
              id="tech-desc-sv"
              rows={3}
              className={textareaClass}
              value={descriptionSv}
              onChange={(e) => setDescriptionSv(e.target.value)}
            />
          </FormField>

          <FormField>
            <Label htmlFor="tech-desc-fi">
              {t('techniques.form.descriptionFi', {
                defaultValue: 'Description (FI)',
              })}
            </Label>
            <textarea
              id="tech-desc-fi"
              rows={3}
              className={textareaClass}
              value={descriptionFi}
              onChange={(e) => setDescriptionFi(e.target.value)}
            />
          </FormField>

          <FormField>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isKihon}
                onChange={(e) => setIsKihon(e.target.checked)}
              />
              {t('techniques.form.isKihon', { defaultValue: 'Kihon' })}
            </label>
          </FormField>

          <FormField>
            <Label htmlFor="tech-sort-order">
              {t('techniques.form.sortOrder', { defaultValue: 'Sort order' })}
            </Label>
            <Input
              id="tech-sort-order"
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
