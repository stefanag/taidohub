import { z } from 'zod';

/**
 * Terms of use and privacy notices owned by the platform, a federation or a
 * club. See docs/superpowers/plans/2026-11-26-legal-documents.md.
 */

const UUID_EXAMPLE = 'c5a1d6f0-9f3a-4b2c-8d4e-6f7a8b9c0d1e';
const HASH_EXAMPLE = '3b9c358f36f1d2d5bbd7a0b8b6c5f0e2a8f9d6c4b3a2e1f0d9c8b7a6f5e4d3c2';

/** Languages a text can be written in. Extend here; no migration needed. */
export const LegalLocaleSchema = z
  .enum(['sv', 'en', 'fi'])
  .meta({ id: 'LegalLocale', description: 'A language a legal text can be written in.' });
export type LegalLocale = z.infer<typeof LegalLocaleSchema>;
export const LEGAL_LOCALES = LegalLocaleSchema.options;

export const LegalDocumentKindSchema = z.enum(['terms', 'privacy', 'dpa']).meta({
  id: 'LegalDocumentKind',
  description:
    '`terms` are accepted, `privacy` notices are acknowledged as received, `dpa` is a data processing agreement (platform only, not yet in use).',
});
export type LegalDocumentKind = z.infer<typeof LegalDocumentKindSchema>;

export const LegalAudienceSchema = z.enum(['members', 'self_registered', 'organisations']).meta({
  id: 'LegalAudience',
  description:
    'Who a text is for. `self_registered` and `organisations` are only allowed for platform texts.',
});
export type LegalAudience = z.infer<typeof LegalAudienceSchema>;

export const LegalVersionStatusSchema = z
  .enum(['draft', 'published', 'retired'])
  .meta({ id: 'LegalVersionStatus' });
export type LegalVersionStatus = z.infer<typeof LegalVersionStatusSchema>;

/** Quill Delta, the same format as the profile's "About me". */
export const LegalBodySchema = z
  .object({ ops: z.array(z.unknown()) })
  .refine((v) => JSON.stringify(v).length <= 200_000, { message: 'The text exceeds 200 KB.' })
  .meta({ id: 'LegalBody', description: 'A Quill Delta.' });

// ── Admin shapes ─────────────────────────────────────────────────────────

export const LegalTranslationSchema = z
  .object({
    locale: LegalLocaleSchema,
    revision: z.number().int().positive(),
    title: z.string(),
    body: LegalBodySchema,
    contentHash: z.string(),
    needsReview: z.boolean(),
    createdAt: z.iso.datetime(),
  })
  .meta({
    id: 'LegalTranslation',
    description:
      'The latest revision of one language of a version. `needsReview` translations were copied from the previous version and are not shown to users.',
    example: {
      locale: 'sv',
      revision: 1,
      title: 'Användarvillkor',
      body: { ops: [{ insert: 'Villkoren …\n' }] },
      contentHash: HASH_EXAMPLE,
      needsReview: false,
      createdAt: '2026-11-26T10:00:00.000Z',
    },
  });
export type LegalTranslation = z.infer<typeof LegalTranslationSchema>;

export const LegalDocumentVersionSchema = z
  .object({
    id: z.uuid(),
    documentId: z.uuid(),
    version: z.number().int().positive(),
    status: LegalVersionStatusSchema,
    authoritativeLocale: LegalLocaleSchema,
    requiresReacceptance: z.boolean(),
    changeSummary: z.string().nullable(),
    publishedAt: z.iso.datetime().nullable(),
    translations: z.array(LegalTranslationSchema),
  })
  .meta({
    id: 'LegalDocumentVersion',
    description:
      'One version of a text. The translation in `authoritativeLocale` is legally binding and can never change once published.',
  });
export type LegalDocumentVersion = z.infer<typeof LegalDocumentVersionSchema>;

export const LegalDocumentSchema = z
  .object({
    id: z.uuid(),
    kind: LegalDocumentKindSchema,
    organisationId: z.uuid().nullable(),
    audience: LegalAudienceSchema,
    createdAt: z.iso.datetime(),
    published: LegalDocumentVersionSchema.nullable(),
    draft: LegalDocumentVersionSchema.nullable(),
  })
  .meta({
    id: 'LegalDocument',
    description:
      'A text owned by the platform (`organisationId` null) or an organisation, with its published version and its draft, if any.',
  });
export type LegalDocument = z.infer<typeof LegalDocumentSchema>;

export const ListLegalDocumentsQuerySchema = z
  .object({
    /** `platform` for the platform's own texts, otherwise an organisation id. */
    owner: z.union([z.literal('platform'), z.uuid()]),
  })
  .meta({ id: 'ListLegalDocumentsQuery' });
export type ListLegalDocumentsQuery = z.infer<typeof ListLegalDocumentsQuerySchema>;

export const CreateLegalDocumentSchema = z
  .object({
    kind: z.enum(['terms', 'privacy']),
    organisationId: z.uuid().nullable(),
    audience: z.enum(['members', 'self_registered']),
  })
  .meta({
    id: 'CreateLegalDocumentInput',
    example: { kind: 'terms', organisationId: UUID_EXAMPLE, audience: 'members' },
  });
export type CreateLegalDocumentInput = z.infer<typeof CreateLegalDocumentSchema>;

export const CreateLegalDocumentVersionSchema = z
  .object({
    authoritativeLocale: LegalLocaleSchema,
    /** Copy the published version's translations as a starting point (marked "needs review"). */
    copyFromPublished: z.boolean().default(true),
  })
  .meta({ id: 'CreateLegalDocumentVersionInput' });
export type CreateLegalDocumentVersionInput = z.infer<typeof CreateLegalDocumentVersionSchema>;

export const UpdateLegalDocumentVersionSchema = z
  .object({
    authoritativeLocale: LegalLocaleSchema.optional(),
    requiresReacceptance: z.boolean().optional(),
    changeSummary: z.string().trim().max(2000).nullable().optional(),
  })
  .meta({ id: 'UpdateLegalDocumentVersionInput' });
export type UpdateLegalDocumentVersionInput = z.infer<typeof UpdateLegalDocumentVersionSchema>;

export const SaveLegalTranslationSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    body: LegalBodySchema,
  })
  .meta({
    id: 'SaveLegalTranslationInput',
    description:
      'On a draft this replaces the translation; on a published version it adds a revision, except for the authoritative language, which is refused.',
  });
export type SaveLegalTranslationInput = z.infer<typeof SaveLegalTranslationSchema>;

// ── Public shapes ────────────────────────────────────────────────────────

export const PublishedLegalDocumentSchema = z
  .object({
    documentId: z.uuid(),
    kind: LegalDocumentKindSchema,
    audience: LegalAudienceSchema,
    organisationId: z.uuid().nullable(),
    versionId: z.uuid(),
    version: z.number().int().positive(),
    publishedAt: z.iso.datetime(),
    authoritativeLocale: LegalLocaleSchema,
    /** Languages with a reviewed translation, the authoritative one included. */
    availableLocales: z.array(LegalLocaleSchema),
    translation: z.object({
      locale: LegalLocaleSchema,
      revision: z.number().int().positive(),
      title: z.string(),
      body: LegalBodySchema,
    }),
    /** True when the requested language was missing and the authoritative one is shown instead. */
    isFallback: z.boolean(),
  })
  .meta({
    id: 'PublishedLegalDocument',
    description:
      'A published text in one language. When `translation.locale` differs from `authoritativeLocale`, the text is a translation and the authoritative language takes precedence.',
    example: {
      documentId: UUID_EXAMPLE,
      kind: 'terms',
      audience: 'members',
      organisationId: null,
      versionId: UUID_EXAMPLE,
      version: 1,
      publishedAt: '2026-11-26T10:00:00.000Z',
      authoritativeLocale: 'sv',
      availableLocales: ['sv', 'en'],
      translation: {
        locale: 'en',
        revision: 1,
        title: 'Terms of use',
        body: { ops: [{ insert: 'Terms …\n' }] },
      },
      isFallback: false,
    },
  });
export type PublishedLegalDocument = z.infer<typeof PublishedLegalDocumentSchema>;

export const GetPublishedLegalDocumentQuerySchema = z
  .object({
    organisationId: z.uuid().optional(),
    kind: LegalDocumentKindSchema,
    audience: LegalAudienceSchema.default('members'),
    locale: LegalLocaleSchema.optional(),
  })
  .meta({ id: 'GetPublishedLegalDocumentQuery' });
export type GetPublishedLegalDocumentQuery = z.infer<typeof GetPublishedLegalDocumentQuerySchema>;

export const InvitationLegalTextsQuerySchema = z
  .object({
    token: z.string().min(1),
    locale: LegalLocaleSchema.optional(),
  })
  .meta({ id: 'InvitationLegalTextsQuery' });
export type InvitationLegalTextsQuery = z.infer<typeof InvitationLegalTextsQuerySchema>;

export const ApplicableLegalTextsSchema = z
  .object({
    documents: z.array(PublishedLegalDocumentSchema),
  })
  .meta({
    id: 'ApplicableLegalTexts',
    description:
      'The texts a user must accept (terms) or acknowledge (privacy) for an action. Empty when nothing is published.',
  });
export type ApplicableLegalTexts = z.infer<typeof ApplicableLegalTextsSchema>;

export const LegalAcknowledgementInputSchema = z
  .object({
    versionId: z.uuid(),
    /** The language the user was shown. */
    locale: LegalLocaleSchema,
  })
  .meta({ id: 'LegalAcknowledgementInput' });
export type LegalAcknowledgementInput = z.infer<typeof LegalAcknowledgementInputSchema>;

export const LegalDocumentsOpenApiRegistry = {
  LegalLocale: LegalLocaleSchema,
  LegalDocumentKind: LegalDocumentKindSchema,
  LegalAudience: LegalAudienceSchema,
  LegalVersionStatus: LegalVersionStatusSchema,
  LegalTranslation: LegalTranslationSchema,
  LegalDocumentVersion: LegalDocumentVersionSchema,
  LegalDocument: LegalDocumentSchema,
  CreateLegalDocumentInput: CreateLegalDocumentSchema,
  CreateLegalDocumentVersionInput: CreateLegalDocumentVersionSchema,
  UpdateLegalDocumentVersionInput: UpdateLegalDocumentVersionSchema,
  SaveLegalTranslationInput: SaveLegalTranslationSchema,
  PublishedLegalDocument: PublishedLegalDocumentSchema,
  ApplicableLegalTexts: ApplicableLegalTextsSchema,
  LegalAcknowledgementInput: LegalAcknowledgementInputSchema,
} as const;
