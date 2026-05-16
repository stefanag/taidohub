import { ListOrganisationsQuerySchema } from '@repo/contracts/organisations';
import { createZodDto } from 'nestjs-zod';
export class ListOrganisationsQueryDto extends createZodDto(ListOrganisationsQuerySchema) {}
