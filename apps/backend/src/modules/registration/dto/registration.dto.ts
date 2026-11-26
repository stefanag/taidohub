import { ApplicableLegalTextsSchema } from '@repo/contracts/legal-documents';
import {
  DeleteOwnAccountSchema,
  RegisterInputSchema,
  RegisterResponseSchema,
  RegistrationFederationSchema,
  RegistrationLegalTextsQuerySchema,
} from '@repo/contracts/registration';
import { createZodDto } from 'nestjs-zod';

export class RegisterInputDto extends createZodDto(RegisterInputSchema) {}
export class RegisterResponseDto extends createZodDto(RegisterResponseSchema) {}
export class RegistrationFederationDto extends createZodDto(RegistrationFederationSchema) {}
export class RegistrationLegalTextsQueryDto extends createZodDto(
  RegistrationLegalTextsQuerySchema,
) {}
export class RegistrationLegalTextsDto extends createZodDto(ApplicableLegalTextsSchema) {}
export class DeleteOwnAccountDto extends createZodDto(DeleteOwnAccountSchema) {}
