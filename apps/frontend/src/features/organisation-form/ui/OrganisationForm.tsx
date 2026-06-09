import { Building2, History } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { ZodTypeAny } from 'zod';

import type { IsoAlpha3 } from '@repo/contracts/organisations';

import {
  countryName,
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
import { AuditLogTable } from '@/widgets/audit-log-table';

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
  // `null` for an IF, an ISO-3 code otherwise. Default `type` here is
  // `'club'` so we seed a real code; `handleTypeChange` swaps to/from
  // `null` if the user picks a different `type`.
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

// The keys the form is actually responsible for. The full `Organisation` row
// (passed as `initialValues` in edit mode) carries `id`, `createdAt`,
// `updatedAt` which `UpdateOrganisationSchema.strict()` rejects as
// unrecognized keys — that surfaces as a `_root` error on submit. Filtering
// to these keys at form init keeps the values clean.
const EDITABLE_KEYS = Object.keys(DEFAULTS) as Array<keyof CreateOrganisationInput>;

function pickEditable(
  source: Partial<CreateOrganisationInput> & Record<string, unknown> | undefined,
): Partial<CreateOrganisationInput> {
  if (!source) return {};
  const out: Partial<CreateOrganisationInput> = {};
  for (const key of EDITABLE_KEYS) {
    if (key in source) {
      // The assignment is sound because EDITABLE_KEYS is statically typed
      // against `CreateOrganisationInput`; TypeScript can't track that here.
      (out as Record<string, unknown>)[key] = (source as Record<string, unknown>)[key];
    }
  }
  return out;
}

const TYPE_LABEL_KEYS: Record<(typeof ORG_TYPES)[number], string> = {
  international_federation: 'internationalFederation',
  national_federation: 'nationalFederation',
  club: 'club',
};

// Tabs in display order. Used to find the first invalid one after submit.
const NAME_TABS = ['en', 'sv', 'fi', 'ja'] as const;
type NameTab = (typeof NAME_TABS)[number];

const NAME_TAB_FIELD: Record<NameTab, 'nameEn' | 'nameSv' | 'nameFi' | 'nameJa'> = {
  en: 'nameEn',
  sv: 'nameSv',
  fi: 'nameFi',
  ja: 'nameJa',
};

// Form field key → i18n label key under `admin.organisations.fields.*`.
// Used to render human-readable names in the validation summary.
const FIELD_LABEL_KEYS = {
  type: 'type',
  shortCode: 'shortCode',
  slug: 'slug',
  country: 'country',
  parentId: 'parent',
  nameEn: 'nameEn',
  nameSv: 'nameSv',
  nameFi: 'nameFi',
  nameJa: 'nameJa',
  logoUrl: 'logoUrl',
  address: 'address',
  contactEmail: 'contactEmail',
  headInstructorId: 'headInstructor',
} as const;

export interface OrganisationFormProps {
  mode: 'create' | 'edit';
  /** Pre-populated values for edit mode (or initial defaults in create). */
  initialValues?: Partial<CreateOrganisationInput> & { id?: string };
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
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'en';

  // Country dropdown options, sorted by localised name in the current
  // locale. Memoised because the codes list is static (~195 entries) and
  // the sort uses an `Intl.Collator` allocation we don't want to repeat
  // on every render.
  const countryOptions = React.useMemo(() => {
    const collator = new Intl.Collator(locale, { sensitivity: 'base' });
    return ISO_3166_ALPHA3_CODES.map((code) => ({
      code,
      label: countryName(code as IsoAlpha3, locale),
    })).sort((a, b) => collator.compare(a.label, b.label));
  }, [locale]);
  // `useZodForm` is generic over a single schema; we pick one based on mode.
  // The two schemas have compatible shapes for the fields we touch, but the
  // generic can't widen across them in TS — cast the schema here so the
  // helper sees one concrete `ZodTypeAny`. Runtime behaviour is what matters.
  const schema = (
    mode === 'create' ? CreateOrganisationSchema : UpdateOrganisationSchema
  ) as unknown as ZodTypeAny;
  const form = useZodForm(schema, { ...DEFAULTS, ...pickEditable(initialValues) });
  const [submitError, setSubmitError] = React.useState<string | undefined>();
  // Controlled active name tab so we can auto-jump to a tab that has a
  // validation error after a failed submit.
  const [activeNameTab, setActiveNameTab] = React.useState<'en' | 'sv' | 'fi' | 'ja'>('en');
  // Field keys that failed the last validation pass. Drives the global
  // "fix these" summary at the bottom of the form.
  const [invalidFieldKeys, setInvalidFieldKeys] = React.useState<string[]>([]);

  const handleSubmit = async (
    event: React.SyntheticEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    setSubmitError(undefined);
    const result = form.validate();
    if (!result.ok) {
      const keys = Object.keys(result.errors);
      setInvalidFieldKeys(keys);

      // If the failure is on a name field, jump to its tab so the user can
      // see the inline error message and fix it.
      const firstNameTab = NAME_TABS.find((tab) => keys.includes(NAME_TAB_FIELD[tab]));
      if (firstNameTab) {
        setActiveNameTab(firstNameTab);
      }
      return;
    }
    setInvalidFieldKeys([]);
    try {
      await onSubmit(result.data as CreateOrganisationInput | UpdateOrganisationInput);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Submit failed');
    }
  };

  // Label resolver for the global "fix these fields" summary. Falls back to
  // the raw key if a translation is missing so we never render an empty list.
  const fieldLabel = (key: string): string => {
    if (key in FIELD_LABEL_KEYS) {
      const labelKey = FIELD_LABEL_KEYS[key as keyof typeof FIELD_LABEL_KEYS];
      return t(`admin.organisations.fields.${labelKey}`, { defaultValue: labelKey });
    }
    return key;
  };

  const typeValue = (form.values.type as string | undefined) ?? 'club';
  const countryValue = (form.values.country as string | null | undefined) ?? null;
  const parentValue = (form.values.parentId as string | null | undefined) ?? null;
  const isInternationalFederation = typeValue === 'international_federation';

  // Keep `country` consistent with `type`: IFs require null; NF/club
  // require a non-null ISO code. When the user toggles `type` we swap the
  // country value in tandem so the form never sits in a state the schema
  // (or backend) would reject. `'SWE'` is just the fallback default —
  // matches `DEFAULTS.country`.
  const handleTypeChange = (next: string): void => {
    form.setField('type', next);
    if (next === 'international_federation' && countryValue !== null) {
      form.setField('country', null);
    } else if (next !== 'international_federation' && countryValue === null) {
      form.setField('country', 'SWE');
    }
  };

  const formBody = (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {/* Type */}
      <FormField>
        <Label htmlFor="org-type">
          {t('admin.organisations.fields.type', { defaultValue: 'Type' })}
        </Label>
        <Select
          value={typeValue}
          onValueChange={handleTypeChange}
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

      {/* Country — hidden for international federations (they're
          supra-national; the schema enforces `country: null` for IFs). */}
      {!isInternationalFederation ? (
        <FormField>
          <Label htmlFor="org-country">
            {t('admin.organisations.fields.country', { defaultValue: 'Country' })}
          </Label>
          <Select
            value={countryValue ?? ''}
            onValueChange={(v) => form.setField('country', v)}
          >
            <SelectTrigger id="org-country" aria-label={t('admin.organisations.fields.country', { defaultValue: 'Country' })}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {countryOptions.map(({ code, label }) => (
                <SelectItem key={code} value={code}>
                  {label} ({code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage message={form.errors.country} />
        </FormField>
      ) : null}

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
        <Tabs value={activeNameTab} onValueChange={(v) => setActiveNameTab(v as NameTab)}>
          <TabsList>
            {NAME_TABS.map((tab) => {
              const fieldKey = NAME_TAB_FIELD[tab];
              const hasError = Boolean(form.errors[fieldKey]);
              return (
                <TabsTrigger key={tab} value={tab}>
                  <span className="inline-flex items-center gap-1">
                    {tab.toUpperCase()}
                    {hasError ? (
                      <span
                        aria-label={t('admin.organisations.errors.tabInvalid', { defaultValue: 'has errors' })}
                        className="inline-block size-1.5 rounded-full bg-error"
                      />
                    ) : null}
                  </span>
                </TabsTrigger>
              );
            })}
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

      {invalidFieldKeys.length > 0 ? (
        <FormMessage
          message={t('admin.organisations.errors.validationSummary', {
            defaultValue: 'Please complete required fields: {{fields}}',
            fields: invalidFieldKeys.map(fieldLabel).join(', '),
          })}
        />
      ) : null}

      <FormMessage message={submitError} />

      <Button type="submit" disabled={submitting}>
        {mode === 'create'
          ? t('common.create', { defaultValue: 'Create' })
          : t('common.save', { defaultValue: 'Save' })}
      </Button>
    </form>
  );

  if (mode === 'edit' && initialValues?.id) {
    return (
      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details" className="gap-2">
            <Building2 className="size-4" aria-hidden />
            {t('admin.auditLog.tabs.details', { defaultValue: 'Details' })}
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-2">
            <History className="size-4" aria-hidden />
            {t('admin.auditLog.tabs.activity', { defaultValue: 'Activity' })}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="details">{formBody}</TabsContent>
        <TabsContent value="activity">
          <AuditLogTable
            query={{
              entityType: 'organisation',
              entityId: initialValues.id,
              page: 1,
              perPage: 25,
            }}
          />
        </TabsContent>
      </Tabs>
    );
  }

  return formBody;
}
