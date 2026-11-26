import {
  ApplicableLegalTextsSchema,
  CreateLegalDocumentSchema,
  CreateLegalDocumentVersionSchema,
  GetPublishedLegalDocumentQuerySchema,
  InvitationLegalTextsQuerySchema,
  LegalDocumentSchema,
  ListLegalDocumentsQuerySchema,
  PublishedLegalDocumentSchema,
  SaveLegalTranslationSchema,
  UpdateLegalDocumentVersionSchema,
} from '@repo/contracts/legal-documents';
import { createZodDto } from 'nestjs-zod';

export class LegalDocumentDto extends createZodDto(LegalDocumentSchema) {}
export class ListLegalDocumentsQueryDto extends createZodDto(ListLegalDocumentsQuerySchema) {}
export class CreateLegalDocumentDto extends createZodDto(CreateLegalDocumentSchema) {}
export class CreateLegalDocumentVersionDto extends createZodDto(CreateLegalDocumentVersionSchema) {}
export class UpdateLegalDocumentVersionDto extends createZodDto(UpdateLegalDocumentVersionSchema) {}
export class SaveLegalTranslationDto extends createZodDto(SaveLegalTranslationSchema) {}
export class PublishedLegalDocumentDto extends createZodDto(PublishedLegalDocumentSchema) {}
export class GetPublishedLegalDocumentQueryDto extends createZodDto(
  GetPublishedLegalDocumentQuerySchema,
) {}
export class InvitationLegalTextsQueryDto extends createZodDto(InvitationLegalTextsQuerySchema) {}
export class ApplicableLegalTextsDto extends createZodDto(ApplicableLegalTextsSchema) {}
