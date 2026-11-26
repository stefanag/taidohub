export type {
  ApplicableLegalTexts,
  LegalAudience,
  LegalDocument,
  LegalDocumentKind,
  LegalDocumentVersion,
  LegalLocale,
  LegalTranslation,
  PublishedLegalDocument,
} from '@repo/contracts/legal-documents';
export { LEGAL_LOCALES } from '@repo/contracts/legal-documents';

export {
  createLegalDocument,
  createLegalDocumentVersion,
  deleteLegalDocumentDraft,
  deleteLegalTranslation,
  getInvitationLegalTexts,
  getPublishedLegalDocument,
  listLegalDocuments,
  publishLegalDocumentVersion,
  saveLegalTranslation,
  updateLegalDocumentVersion,
  type LegalOwner,
  type PublishedLegalQuery,
} from './api/legal-documents.api.js';
export {
  legalDocumentKeys,
  useInvitationLegalTextsQuery,
  useLegalDocumentMutation,
  useLegalDocumentsQuery,
  usePublishedLegalDocumentQuery,
} from './lib/hooks.js';
export { languageName } from './lib/locale.js';
export { LegalTextView, type LegalTextViewProps } from './ui/LegalTextView.js';
