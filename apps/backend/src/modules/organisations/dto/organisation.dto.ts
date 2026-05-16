import { OrganisationSchema } from '@repo/contracts/organisations';
import { createZodDto } from 'nestjs-zod';
export class OrganisationDto extends createZodDto(OrganisationSchema) {}
