import { ISO_3166_ALPHA3_CODES } from './iso-3166-alpha3.js';
import { z } from './zod-openapi.js';

/**
 * An ISO 3166-1 alpha-3 country code — the same representation
 * `organisations.country` uses. Refined against the static
 * `ISO_3166_ALPHA3_CODES` tuple so the contract rejects free text.
 */
export const CountryCodeSchema = z
  .string()
  .refine((c) => (ISO_3166_ALPHA3_CODES as readonly string[]).includes(c), {
    message: 'Unknown country code.',
  });

/**
 * The full user profile as returned by the API. All personal fields are
 * nullable; `citizenships` is always an array (possibly empty). The
 * `created_at` / `updated_at` bookkeeping columns are deliberately not
 * exposed — the profile UI has no use for them.
 */
export const UserProfileSchema = z
  .object({
    userId: z.string(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    dateOfBirth: z.string().date().nullable(),
    taidoStartDate: z.string().date().nullable(),
    addressStreet: z.string().nullable(),
    addressPostalCode: z.string().nullable(),
    addressCity: z.string().nullable(),
    addressCountry: CountryCodeSchema.nullable(),
    citizenships: CountryCodeSchema.array(),
  })
  .meta({
    id: 'UserProfile',
    description: "A user's self-service profile — personal and taido-training details.",
    example: {
      userId: 'u-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      dateOfBirth: '1990-12-10',
      taidoStartDate: '2015-09-01',
      addressStreet: '12 Analytical Way',
      addressPostalCode: '11122',
      addressCity: 'Stockholm',
      addressCountry: 'SWE',
      citizenships: ['SWE', 'GBR'],
    },
  });

export type UserProfile = z.infer<typeof UserProfileSchema>;

/**
 * The editable subset — a partial PATCH. Every field is `.optional()`
 * (omitted = no change); text/date fields are also `.nullable()` so a user
 * can blank them out.
 */
export const UpdateUserProfileSchema = z
  .object({
    firstName: z.string().max(200).nullable().optional(),
    lastName: z.string().max(200).nullable().optional(),
    dateOfBirth: z.string().date().nullable().optional(),
    taidoStartDate: z.string().date().nullable().optional(),
    addressStreet: z.string().max(300).nullable().optional(),
    addressPostalCode: z.string().max(20).nullable().optional(),
    addressCity: z.string().max(200).nullable().optional(),
    addressCountry: CountryCodeSchema.nullable().optional(),
    citizenships: CountryCodeSchema.array().optional(),
  })
  .meta({
    id: 'UpdateUserProfileInput',
    description: 'A partial profile patch — omit a field to leave it unchanged.',
    example: { firstName: 'Ada', lastName: 'Lovelace', citizenships: ['SWE', 'GBR'] },
  });

export type UpdateUserProfileInput = z.infer<typeof UpdateUserProfileSchema>;

export const ProfileOpenApiRegistry = {
  UserProfile: UserProfileSchema,
  UpdateUserProfileInput: UpdateUserProfileSchema,
} as const;
