import { z } from './zod-openapi.js';
import { isIsoAlpha3, ISO_3166_ALPHA3_CODES } from './iso-3166-alpha3.js';

const UUID_EXAMPLE = '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5';
const ISO_DATETIME_EXAMPLE = '2025-04-02T08:00:00.000Z';

export const OrganisationTypeSchema = z
  .enum(['international_federation', 'national_federation', 'club'])
  .meta({ id: 'OrganisationType', description: 'Organisation type (immutable after create).' });

export type OrganisationType = z.infer<typeof OrganisationTypeSchema>;

const CountrySchema = z
  .string()
  .regex(/^[A-Z]{3}$/, 'Country must be ISO 3166-1 alpha-3.')
  .refine(isIsoAlpha3, { message: 'Unknown country code.' });

const OptionalEmail = z.string().email().nullable().optional();

// Bare object shape (no refine, no meta). Kept as a plain `ZodObject` so we
// can derive Create/Update via `.omit()` / `.partial()` — once you wrap a
// schema in `.superRefine()` it becomes `ZodEffects` and those methods are
// no longer available.
const OrganisationObject = z.object({
  id: z.string().uuid().describe('Unique identifier.'),
  parentId: z.string().uuid().nullable().describe('Parent organisation id, null for international federations.'),
  type: OrganisationTypeSchema,
  shortCode: z.string().min(1).max(20).describe('Short display code, e.g. "WTF".'),
  slug: z.string().min(1).max(100).nullable().describe('URL-safe full name. Unique when present.'),
  country: CountrySchema.nullable().describe(
    'ISO 3166-1 alpha-3 country code. Null for international federations.',
  ),
  nameEn: z.string().min(1).max(200),
  nameSv: z.string().min(1).max(200),
  nameFi: z.string().min(1).max(200),
  nameJa: z.string().max(200).nullable(),
  logoUrl: z.string().url().nullable(),
  address: z.string().nullable(),
  contactEmail: OptionalEmail,
  headInstructorId: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// Country presence is dictated by `type`: international federations must
// have `country: null` (they're supra-national), and national federations
// / clubs must have a valid ISO code. Reported as an issue on `country` so
// the form surfaces it under the country field.
function enforceCountryByType(
  data: { type: OrganisationType; country: string | null },
  ctx: z.RefinementCtx,
): void {
  if (data.type === 'international_federation' && data.country !== null) {
    ctx.addIssue({
      code: 'custom',
      path: ['country'],
      message: 'International federations must not have a country.',
    });
  }
  if (data.type !== 'international_federation' && data.country === null) {
    ctx.addIssue({
      code: 'custom',
      path: ['country'],
      message: 'Country is required for national federations and clubs.',
    });
  }
}

export const OrganisationSchema = OrganisationObject.superRefine(enforceCountryByType).meta({
  id: 'Organisation',
  example: {
    id: UUID_EXAMPLE,
    parentId: null,
    type: 'international_federation',
    shortCode: 'WTF',
    slug: 'world-taido-federation',
    country: null,
    nameEn: 'World Taido Federation',
    nameSv: 'Världstaidoförbundet',
    nameFi: 'Maailman Taidoliitto',
    nameJa: '世界躰道連盟',
    logoUrl: null,
    address: null,
    contactEmail: null,
    headInstructorId: null,
    createdAt: ISO_DATETIME_EXAMPLE,
    updatedAt: ISO_DATETIME_EXAMPLE,
  },
});

export const CreateOrganisationSchema = OrganisationObject.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})
  .superRefine(enforceCountryByType)
  .meta({ id: 'CreateOrganisationInput' });

// Not `.strict()` deliberately: clients (and the `OrganisationForm` in
// particular) routinely round-trip the full `Organisation` row, including
// `id` / `createdAt` / `updatedAt` / `type`. Stripping silently keeps the
// API permissive on the wire; the repo's writable-key allow-list is what
// actually enforces immutability of `type` (and prevents mass-assignment
// of `id`, timestamps, etc.).
//
// No cross-field refine here: a partial update can't see `type` (it's
// immutable and stripped above), so we can't validate the country rule
// from the patch alone. The service layer enforces it against the
// existing row's type before writing.
export const UpdateOrganisationSchema = OrganisationObject.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  type: true,
})
  .partial()
  .meta({ id: 'UpdateOrganisationInput' });

export const ListOrganisationsQuerySchema = z
  .object({
    type: OrganisationTypeSchema.optional(),
    country: CountrySchema.optional(),
    parentId: z.string().uuid().nullable().optional(),
    q: z.string().optional(),
  })
  .meta({ id: 'ListOrganisationsQuery' });

export const ListOrganisationsResponseSchema = z
  .object({
    data: OrganisationSchema.array(),
    total: z.number().int().nonnegative(),
  })
  .meta({ id: 'ListOrganisationsResponse' });

export type Organisation = z.infer<typeof OrganisationSchema>;
export type CreateOrganisationInput = z.infer<typeof CreateOrganisationSchema>;
export type UpdateOrganisationInput = z.infer<typeof UpdateOrganisationSchema>;
export type ListOrganisationsQuery = z.infer<typeof ListOrganisationsQuerySchema>;
export type ListOrganisationsResponse = z.infer<typeof ListOrganisationsResponseSchema>;

export const OrganisationsOpenApiRegistry = {
  Organisation: OrganisationSchema,
  OrganisationType: OrganisationTypeSchema,
  CreateOrganisationInput: CreateOrganisationSchema,
  UpdateOrganisationInput: UpdateOrganisationSchema,
  ListOrganisationsQuery: ListOrganisationsQuerySchema,
  ListOrganisationsResponse: ListOrganisationsResponseSchema,
} as const;

export { ISO_3166_ALPHA3_CODES, isIsoAlpha3 } from './iso-3166-alpha3.js';
export type { IsoAlpha3 } from './iso-3166-alpha3.js';
