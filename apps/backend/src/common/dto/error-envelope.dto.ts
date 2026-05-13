import { ErrorEnvelopeSchema } from '@repo/contracts/errors';
import { createZodDto } from 'nestjs-zod';

/** Swagger-discoverable DTO wrapping the contract's error envelope schema. */
export class ErrorEnvelopeDto extends createZodDto(ErrorEnvelopeSchema) {}
