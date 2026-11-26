import {
  ApplicableLegalTextsSchema,
  LegalDocumentSchema,
  PublishedLegalDocumentSchema,
  type ApplicableLegalTexts,
  type CreateLegalDocumentInput,
  type CreateLegalDocumentVersionInput,
  type LegalAudience,
  type LegalDocument,
  type LegalDocumentKind,
  type LegalLocale,
  type PublishedLegalDocument,
  type SaveLegalTranslationInput,
  type UpdateLegalDocumentVersionInput,
} from '@repo/contracts/legal-documents';
import { LegalRoutes } from '@repo/contracts/routes';

import { httpClient } from '@/shared/api';

/** `platform` for the platform's own texts, otherwise an organisation id. */
export type LegalOwner = 'platform' | string;

// ── Public ───────────────────────────────────────────────────────────────

export interface PublishedLegalQuery {
  owner: LegalOwner;
  kind: LegalDocumentKind;
  audience?: LegalAudience | undefined;
  locale?: LegalLocale | undefined;
}

export async function getPublishedLegalDocument(
  q: PublishedLegalQuery,
): Promise<PublishedLegalDocument> {
  const raw = await httpClient(LegalRoutes.published, {
    query: {
      kind: q.kind,
      audience: q.audience,
      locale: q.locale,
      organisationId: q.owner === 'platform' ? undefined : q.owner,
    },
  });
  return PublishedLegalDocumentSchema.parse(raw);
}

export async function getInvitationLegalTexts(
  token: string,
  locale?: LegalLocale,
): Promise<ApplicableLegalTexts> {
  const raw = await httpClient(LegalRoutes.invitation, { query: { token, locale } });
  return ApplicableLegalTextsSchema.parse(raw);
}

// ── Admin ────────────────────────────────────────────────────────────────

const parseList = (raw: unknown): LegalDocument[] => LegalDocumentSchema.array().parse(raw);

export async function listLegalDocuments(owner: LegalOwner): Promise<LegalDocument[]> {
  return parseList(await httpClient(LegalRoutes.documents, { query: { owner } }));
}

export async function createLegalDocument(input: CreateLegalDocumentInput): Promise<LegalDocument> {
  return LegalDocumentSchema.parse(
    await httpClient(LegalRoutes.documents, { method: 'POST', body: input }),
  );
}

export async function createLegalDocumentVersion(
  documentId: string,
  input: CreateLegalDocumentVersionInput,
): Promise<LegalDocument> {
  return LegalDocumentSchema.parse(
    await httpClient(LegalRoutes.versions(documentId), { method: 'POST', body: input }),
  );
}

export async function updateLegalDocumentVersion(
  versionId: string,
  input: UpdateLegalDocumentVersionInput,
): Promise<LegalDocument> {
  return LegalDocumentSchema.parse(
    await httpClient(LegalRoutes.version(versionId), { method: 'PATCH', body: input }),
  );
}

export async function deleteLegalDocumentDraft(versionId: string): Promise<void> {
  await httpClient(LegalRoutes.version(versionId), { method: 'DELETE' });
}

export async function saveLegalTranslation(
  versionId: string,
  locale: LegalLocale,
  input: SaveLegalTranslationInput,
): Promise<LegalDocument> {
  return LegalDocumentSchema.parse(
    await httpClient(LegalRoutes.translation(versionId, locale), { method: 'PUT', body: input }),
  );
}

export async function deleteLegalTranslation(
  versionId: string,
  locale: LegalLocale,
): Promise<LegalDocument> {
  return LegalDocumentSchema.parse(
    await httpClient(LegalRoutes.translation(versionId, locale), { method: 'DELETE' }),
  );
}

export async function publishLegalDocumentVersion(versionId: string): Promise<LegalDocument> {
  return LegalDocumentSchema.parse(
    await httpClient(LegalRoutes.publish(versionId), { method: 'POST' }),
  );
}
