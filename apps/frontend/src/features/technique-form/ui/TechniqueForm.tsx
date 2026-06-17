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
  FormField,
  Input,
  Label,
} from '@/shared/ui';

export interface TechniqueFormProps {
  /** Set when editing; undefined when creating. */
  technique?: Technique;
  /** Called after a successful create or update. */
  onSaved: () => void;
  /** Called when the user clicks Cancel. */
  onCancel: () => void;
}

const ROOT_TECHNIQUE_TYPE: RootCode = 'technique_type';
const ROOT_SOTAI: RootCode = 'sotai_category';
const ROOT_ATTACK: RootCode = 'attack_type';

/**
 * Page-embeddable create / edit form for Techniques. Local-state form (no
 * react-hook-form) to stay terse — the field count is small and there is no
 * cross-field validation beyond "at least one technique_type chip + non-empty
 * romaji". The form has no dialog wrapper of its own; the embedding route
 * supplies the surrounding heading and navigation.
 */
export function TechniqueForm({
  technique,
  onSaved,
  onCancel,
}: TechniqueFormProps): React.ReactElement {
  const { t } = useTranslation();
  const isEdit = !!technique;

  const typeOpts = useClassificationCategoriesByRootQuery(ROOT_TECHNIQUE_TYPE);
  const sotaiOpts = useClassificationCategoriesByRootQuery(ROOT_SOTAI);
  const attackOpts = useClassificationCategoriesByRootQuery(ROOT_ATTACK);

  const [typeIds, setTypeIds] = React.useState<string[]>(
    technique?.classificationsByRoot.technique_type.map((c) => c.id) ?? [],
  );
  const [sotaiIds, setSotaiIds] = React.useState<string[]>(
    technique?.classificationsByRoot.sotai_category.map((c) => c.id) ?? [],
  );
  const [attackIds, setAttackIds] = React.useState<string[]>(
    technique?.classificationsByRoot.attack_type.map((c) => c.id) ?? [],
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
        { onSuccess: () => onSaved() },
      );
    } else {
      createMut.mutate(input, {
        onSuccess: () => onSaved(),
      });
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

      <div className="mt-2 flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={pending}
        >
          {t('common.cancel', { defaultValue: 'Cancel' })}
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          {t('common.save', { defaultValue: 'Save' })}
        </Button>
      </div>
    </form>
  );
}
