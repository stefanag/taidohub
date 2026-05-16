import { UpdateOrganisationSchema } from '@repo/contracts/organisations';
import { createZodDto } from 'nestjs-zod';
export class UpdateOrganisationDto extends createZodDto(UpdateOrganisationSchema) {}
