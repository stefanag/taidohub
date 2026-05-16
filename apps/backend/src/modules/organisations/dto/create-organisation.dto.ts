import { CreateOrganisationSchema } from '@repo/contracts/organisations';
import { createZodDto } from 'nestjs-zod';
export class CreateOrganisationDto extends createZodDto(CreateOrganisationSchema) {}
