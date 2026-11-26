import { describe, expect, it } from 'vitest';

import {
  CreateLegalDocumentSchema,
  LegalBodySchema,
  PublishedLegalDocumentSchema,
  SaveLegalTranslationSchema,
} from '../legal-documents.js';
import { SetInitialPasswordSchema } from '../users.js';

describe('legal documents contract', () => {
  it('round-trips the published document example', () => {
    const example = PublishedLegalDocumentSchema.meta()?.example;
    expect(PublishedLegalDocumentSchema.parse(example)).toEqual(example);
  });

  it('only creates terms and privacy texts, never DPAs, from the API', () => {
    expect(
      CreateLegalDocumentSchema.safeParse({
        kind: 'dpa',
        organisationId: null,
        audience: 'organisations',
      }).success,
    ).toBe(false);
  });

  it('caps the size of a text', () => {
    const huge = { ops: [{ insert: 'x'.repeat(200_001) }] };
    expect(LegalBodySchema.safeParse(huge).success).toBe(false);
    expect(SaveLegalTranslationSchema.safeParse({ title: 'T', body: { ops: [] } }).success).toBe(
      true,
    );
  });

  it('lets set-password omit acknowledgements (password resets)', () => {
    expect(SetInitialPasswordSchema.safeParse({ token: 't', password: 'longenough' }).success).toBe(
      true,
    );
  });
});
