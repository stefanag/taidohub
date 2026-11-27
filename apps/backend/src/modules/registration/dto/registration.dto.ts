import { ApplicableLegalTextsSchema } from '@repo/contracts/legal-documents';
import {
  DeleteOwnAccountSchema,
  RegisterInputSchema,
  RegisterResponseSchema,
  RegisterWithGoogleSchema,
  RegistrationIntentSchema,
  RegistrationFederationSchema,
  RegistrationLegalTextsQuerySchema,
} from '@repo/contracts/registration';
import { createZodDto } from 'nestjs-zod';

export class RegisterInputDto extends createZodDto(RegisterInputSchema) {}
export class RegisterResponseDto extends createZodDto(RegisterResponseSchema) {}
export class RegisterWithGoogleDto extends createZodDto(RegisterWithGoogleSchema) {}
export class RegistrationIntentDto extends createZodDto(RegistrationIntentSchema) {}
export class RegistrationFederationDto extends createZodDto(RegistrationFederationSchema) {}
export class RegistrationLegalTextsQueryDto extends createZodDto(
  RegistrationLegalTextsQuerySchema,
) {}
export class RegistrationLegalTextsDto extends createZodDto(ApplicableLegalTextsSchema) {}
export class DeleteOwnAccountDto extends createZodDto(DeleteOwnAccountSchema) {}
