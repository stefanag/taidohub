import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from '../api/legal-documents.api.js';

import type { LegalOwner, PublishedLegalQuery } from '../api/legal-documents.api.js';
import type { LegalLocale } from '@repo/contracts/legal-documents';

export const legalDocumentKeys = {
  all: ['legal-documents'] as const,
  list: (owner: LegalOwner) => ['legal-documents', 'list', owner] as const,
  published: (q: PublishedLegalQuery) => ['legal-documents', 'published', q] as const,
  invitation: (token: string, locale?: LegalLocale) =>
    ['legal-documents', 'invitation', token, locale] as const,
};

export function usePublishedLegalDocumentQuery(q: PublishedLegalQuery) {
  return useQuery({
    queryKey: legalDocumentKeys.published(q),
    queryFn: () => api.getPublishedLegalDocument(q),
    retry: false,
  });
}

export function useInvitationLegalTextsQuery(token: string, locale?: LegalLocale) {
  return useQuery({
    queryKey: legalDocumentKeys.invitation(token, locale),
    queryFn: () => api.getInvitationLegalTexts(token, locale),
    retry: false,
  });
}

export function useLegalDocumentsQuery(owner: LegalOwner | null) {
  return useQuery({
    queryKey: legalDocumentKeys.list(owner ?? ''),
    queryFn: () => api.listLegalDocuments(owner!),
    enabled: owner !== null,
  });
}

/**
 * Wraps any admin call that returns the changed document and refreshes the
 * lists, so the editor always shows what the server stored.
 */
export function useLegalDocumentMutation<TArgs>(fn: (args: TArgs) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: legalDocumentKeys.all });
    },
  });
}
