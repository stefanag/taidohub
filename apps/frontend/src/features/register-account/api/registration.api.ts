import {
  ApplicableLegalTextsSchema,
  type ApplicableLegalTexts,
  type LegalLocale,
} from '@repo/contracts/legal-documents';
import {
  RegisterResponseSchema,
  RegistrationIntentSchema,
  RegistrationFederationSchema,
  type RegisterInput,
  type RegisterResponse,
  type RegisterWithGoogleInput,
  type RegistrationIntent,
  type RegistrationFederation,
} from '@repo/contracts/registration';
import { RegistrationRoutes } from '@repo/contracts/routes';

import { httpClient } from '@/shared/api';

export async function getRegistrationFederations(): Promise<RegistrationFederation[]> {
  return RegistrationFederationSchema.array().parse(
    await httpClient(RegistrationRoutes.federations),
  );
}

export async function getRegistrationLegalTexts(
  locale?: LegalLocale,
): Promise<ApplicableLegalTexts> {
  return ApplicableLegalTextsSchema.parse(
    await httpClient(RegistrationRoutes.legalTexts, { query: { locale } }),
  );
}

export async function registerAccount(input: RegisterInput): Promise<RegisterResponse> {
  return RegisterResponseSchema.parse(
    await httpClient(RegistrationRoutes.register, { method: 'POST', body: input }),
  );
}

/** Runs the registration checks and returns the intent for a Google sign-up. */
export async function createGoogleRegistrationIntent(input: RegisterWithGoogleInput): Promise<RegistrationIntent> {
  return RegistrationIntentSchema.parse(
    await httpClient(RegistrationRoutes.googleIntent, { method: 'POST', body: input }),
  );
}
