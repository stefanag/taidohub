import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { ZodTypeAny } from 'zod';

import {
  CreateOrganisationSchema,
  ISO_3166_ALPHA3_CODES,
  type CreateOrganisationInput,
  type Organisation,
  UpdateOrganisationSchema,
  type UpdateOrganisationInput,
} from '@/entities/organisation';
import {
  Button,
  FormField,
  FormMessage,
  Input,
  Label,
  useZodForm,
} from '@/shared/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select.js';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/shared/ui/tabs.js';

const ORG_TYPES = [
  'international_federation',
  'national_federation',
  'club',
] as const;

const DEFAULTS: CreateOrganisationInput = {
  parentId: null,
  type: 'club',
  shortCode: '',
  slug: null,
  country: 'SWE',
  nameEn: '',
  nameSv: '',
  nameFi: '',
  nameJa: null,
  logoUrl: null,
  address: null,
  contactEmail: null,
  headInstructorId: null,
};

const TYPE_LABEL_KEYS: Record<(typeof ORG_TYPES)[number], string> = {
  international_federation: 'internationalFederation',
  national_federation: 'nationalFederation',
  club: 'club',
};

export interface OrganisationFormProps {
  mode: 'create' | 'edit';
  /** Pre-populated values for edit mode (or initial defaults in create). */
  initialValues?: Partial<CreateOrganisationInput>;
  /** Other orgs (excluding this one + its descendants in edit mode). Used to populate the parent picker. */
  parentCandidates: Organisation[];
  onSubmit: (
    values: CreateOrganisationInput | UpdateOrganisationInput,
  ) => Promise<void>;
  submitting?: boolean;
}

/**
 * Create/edit form for an `Organisation`. Uses the in-house `useZodForm`
 * helper rather than `react-hook-form` to stay aligned with the rest of the
 * codebase. The schema swaps between create/edit modes; the runtime shape is
 * intentionally identical, only `type` is locked when editing.
 */
export function OrganisationForm({
  mode,
  initialValues,
  parentCandidates,
  onSubmit,
  submitting,
}: OrganisationFormProps): React.ReactElement {
  const { t } = useTranslation();
  // `useZodForm` is generic over a single schema; we pick one based on mode.
  // The two schemas have compatible shapes for the fields we touch, but the
  // generic can't widen across them in TS — cast the schema here so the
  // helper sees one concrete `ZodTypeAny`. Runtime behaviour is what matters.
  const schema = (
    mode === 'create' ? CreateOrganisationSchema : UpdateOrganisationSchema
  ) as unknown as ZodTypeAny;
  const form = useZodForm(schema, { ...DEFAULTS, ...initialValues });
  const [submitError, setSubmitError] = React.useState<string | undefined>();

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    setSubmitError(undefined);
    const result = form.validate();
    if (!result.ok) return;
    try {
      await onSubmit(result.data as CreateOrganisationInput | UpdateOrganisationInput);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Submit failed');
    }
  };

  const typeValue = (form.values.type as string | undefined) ?? 'club';
  const countryValue = (form.values.country as string | undefined) ?? 'SWE';
  const parentValue = (form.values.parentId as string | null | undefined) ?? null;

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {/* Type */}
      <FormField>
        <Label htmlFor="org-type">
          {t('admin.organisations.fields.type', { defaultValue: 'Type' })}
        </Label>
        <Select
          value={typeValue}
          onValueChange={(v) => form.setField('type', v)}
          disabled={mode === 'edit'}
        >
          <SelectTrigger id="org-type" aria-label={t('admin.organisations.fields.type', { defaultValue: 'Type' })}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ORG_TYPES.map((typeName) => (
              <SelectItem key={typeName} value={typeName}>
                {t(`admin.organisations.types.${TYPE_LABEL_KEYS[typeName]}`, {
                  defaultValue: typeName,
                })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FormMessage message={form.errors.type} />
      </FormField>

      {/* Short code + slug (side by side) */}
      <div className="grid grid-cols-2 gap-3">
        <FormField>
          <Label htmlFor="org-short-code">
            {t('admin.organisations.fields.shortCode', { defaultValue: 'Short code' })}
          </Label>
          <Input
            id="org-short-code"
            value={String(form.values.shortCode ?? '')}
            onChange={form.onChange('shortCode')}
          />
          <FormMessage message={form.errors.shortCode} />
        </FormField>
        <FormField>
          <Label htmlFor="org-slug">
            {t('admin.organisations.fields.slug', { defaultValue: 'Slug' })}
          </Label>
          <Input
            id="org-slug"
            value={String(form.values.slug ?? '')}
            onChange={(e) => form.setField('slug', e.target.value || null)}
          />
          <FormMessage message={form.errors.slug} />
        </FormField>
      </div>

      {/* Country */}
      <FormField>
        <Label htmlFor="org-country">
          {t('admin.organisations.fields.country', { defaultValue: 'Country' })}
        </Label>
        <Select
          value={countryValue}
          onValueChange={(v) => form.setField('country', v)}
        >
          <SelectTrigger id="org-country" aria-label={t('admin.organisations.fields.country', { defaultValue: 'Country' })}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-64">
            {ISO_3166_ALPHA3_CODES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FormMessage message={form.errors.country} />
      </FormField>

      {/* Parent */}
      <FormField>
        <Label htmlFor="org-parent">
          {t('admin.organisations.fields.parent', { defaultValue: 'Parent' })}
        </Label>
        <Select
          value={parentValue ?? '__none'}
          onValueChange={(v) => form.setField('parentId', v === '__none' ? null : v)}
        >
          <SelectTrigger id="org-parent" aria-label={t('admin.organisations.fields.parent', { defaultValue: 'Parent' })}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">—</SelectItem>
            {parentCandidates.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.nameEn} ({o.shortCode})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FormMessage message={form.errors.parentId} />
      </FormField>

      {/* Names (locale tabs) */}
      <FormField>
        <Label>
          {t('admin.organisations.fields.names', { defaultValue: 'Names' })}
        </Label>
        <Tabs defaultValue="en">
          <TabsList>
            <TabsTrigger value="en">EN</TabsTrigger>
            <TabsTrigger value="sv">SV</TabsTrigger>
            <TabsTrigger value="fi">FI</TabsTrigger>
            <TabsTrigger value="ja">JA</TabsTrigger>
          </TabsList>
          <TabsContent value="en">
            <Input
              aria-label="nameEn"
              value={String(form.values.nameEn ?? '')}
              onChange={form.onChange('nameEn')}
            />
            <FormMessage message={form.errors.nameEn} />
          </TabsContent>
          <TabsContent value="sv">
            <Input
              aria-label="nameSv"
              value={String(form.values.nameSv ?? '')}
              onChange={form.onChange('nameSv')}
            />
            <FormMessage message={form.errors.nameSv} />
          </TabsContent>
          <TabsContent value="fi">
            <Input
              aria-label="nameFi"
              value={String(form.values.nameFi ?? '')}
              onChange={form.onChange('nameFi')}
            />
            <FormMessage message={form.errors.nameFi} />
          </TabsContent>
          <TabsContent value="ja">
            <Input
              aria-label="nameJa"
              value={String(form.values.nameJa ?? '')}
              onChange={(e) => form.setField('nameJa', e.target.value || null)}
            />
            <FormMessage message={form.errors.nameJa} />
          </TabsContent>
        </Tabs>
      </FormField>

      {/* Contact email */}
      <FormField>
        <Label htmlFor="org-email">
          {t('admin.organisations.fields.contactEmail', { defaultValue: 'Contact email' })}
        </Label>
        <Input
          id="org-email"
          type="email"
          value={String(form.values.contactEmail ?? '')}
          onChange={(e) => form.setField('contactEmail', e.target.value || null)}
        />
        <FormMessage message={form.errors.contactEmail} />
      </FormField>

      {/* Logo URL */}
      <FormField>
        <Label htmlFor="org-logo">
          {t('admin.organisations.fields.logoUrl', { defaultValue: 'Logo URL' })}
        </Label>
        <Input
          id="org-logo"
          type="url"
          value={String(form.values.logoUrl ?? '')}
          onChange={(e) => form.setField('logoUrl', e.target.value || null)}
        />
        <FormMessage message={form.errors.logoUrl} />
      </FormField>

      {/* Address */}
      <FormField>
        <Label htmlFor="org-address">
          {t('admin.organisations.fields.address', { defaultValue: 'Address' })}
        </Label>
        <textarea
          id="org-address"
          className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          value={String(form.values.address ?? '')}
          onChange={(e) => form.setField('address', e.target.value || null)}
        />
        <FormMessage message={form.errors.address} />
      </FormField>

      {/* Head instructor id */}
      <FormField>
        <Label htmlFor="org-instructor">
          {t('admin.organisations.fields.headInstructor', { defaultValue: 'Head instructor id' })}
        </Label>
        <Input
          id="org-instructor"
          value={String(form.values.headInstructorId ?? '')}
          onChange={(e) => form.setField('headInstructorId', e.target.value || null)}
        />
        <FormMessage message={form.errors.headInstructorId} />
      </FormField>

      <FormMessage message={submitError} />

      <Button type="submit" disabled={submitting}>
        {mode === 'create'
          ? t('common.create', { defaultValue: 'Create' })
          : t('common.save', { defaultValue: 'Save' })}
      </Button>
    </form>
  );
}
