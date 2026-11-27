import { z } from 'zod';

import { LegalAcknowledgementInputSchema, LegalLocaleSchema } from './legal-documents.js';

/**
 * Self-registration for people who are not (yet) in a club. See
 * docs/superpowers/plans/2026-11-26-self-registration.md.
 */

/** Minimum age to register without a club (Swedish age of consent for online services). */
export const SELF_REGISTRATION_MIN_AGE = 13;

/** Whole years between `dateOfBirth` and `today`, both `YYYY-MM-DD`. */
export function ageOn(dateOfBirth: string, today: string): number {
  const [by, bm, bd] = dateOfBirth.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = today.split('-').map(Number) as [number, number, number];
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

export const RegisterInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    email: z.email().max(254),
    password: z.string().min(8).max(200),
    locale: LegalLocaleSchema,
    dateOfBirth: z.iso.date(),
    /** The national federation whose grading requirements apply. */
    federationId: z.uuid(),
    /** The platform's self-registration terms accepted and privacy notice acknowledged. */
    acknowledgements: z.array(LegalAcknowledgementInputSchema).max(10).optional(),
  })
  .meta({
    id: 'RegisterInput',
    description:
      'Create an account without a club. The account must verify its email before signing in.',
    example: {
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'a-long-password',
      locale: 'sv',
      dateOfBirth: '1990-12-10',
      federationId: 'c5a1d6f0-9f3a-4b2c-8d4e-6f7a8b9c0d1e',
      acknowledgements: [{ versionId: 'c5a1d6f0-9f3a-4b2c-8d4e-6f7a8b9c0d1f', locale: 'sv' }],
    },
  });
export type RegisterInput = z.infer<typeof RegisterInputSchema>;

/**
 * The checks of a registration without name, email and password, which come
 * from Google. Answered with an intent to pass through the Google sign-in.
 */
export const RegisterWithGoogleSchema = RegisterInputSchema.pick({
  locale: true,
  dateOfBirth: true,
  federationId: true,
  acknowledgements: true,
}).meta({
  id: 'RegisterWithGoogleInput',
  description: 'Checks age, federation and accepted texts before a Google sign-up.',
});
export type RegisterWithGoogleInput = z.infer<typeof RegisterWithGoogleSchema>;

export const RegistrationIntentSchema = z
  .object({ intent: z.string().min(1) })
  .meta({
    id: 'RegistrationIntent',
    description:
      'An opaque, one-hour token to pass as `additionalData.registrationIntent` to the Google sign-in with `requestSignUp: true`.',
  });
export type RegistrationIntent = z.infer<typeof RegistrationIntentSchema>;

export const RegisterResponseSchema = z.object({ status: z.literal('verification_sent') }).meta({
  id: 'RegisterResponse',
  description:
    'Always the same answer, also when the address already has an account, so the endpoint does not reveal who is registered.',
});
export type RegisterResponse = z.infer<typeof RegisterResponseSchema>;

export const RegistrationFederationSchema = z
  .object({
    id: z.uuid(),
    nameEn: z.string(),
    nameSv: z.string(),
    nameFi: z.string(),
    country: z.string().nullable(),
  })
  .meta({
    id: 'RegistrationFederation',
    description: 'A national federation to choose at registration.',
  });
export type RegistrationFederation = z.infer<typeof RegistrationFederationSchema>;

export const RegistrationLegalTextsQuerySchema = z
  .object({ locale: LegalLocaleSchema.optional() })
  .meta({ id: 'RegistrationLegalTextsQuery' });
export type RegistrationLegalTextsQuery = z.infer<typeof RegistrationLegalTextsQuerySchema>;

export const DeleteOwnAccountSchema = z
  .object({ password: z.string().min(1).max(200) })
  .meta({ id: 'DeleteOwnAccountInput', description: 'The current password, to confirm.' });
export type DeleteOwnAccountInput = z.infer<typeof DeleteOwnAccountSchema>;

export const RegistrationOpenApiRegistry = {
  RegisterInput: RegisterInputSchema,
  RegisterResponse: RegisterResponseSchema,
  RegisterWithGoogleInput: RegisterWithGoogleSchema,
  RegistrationIntent: RegistrationIntentSchema,
  RegistrationFederation: RegistrationFederationSchema,
  RegistrationLegalTextsQuery: RegistrationLegalTextsQuerySchema,
  DeleteOwnAccountInput: DeleteOwnAccountSchema,
} as const;
