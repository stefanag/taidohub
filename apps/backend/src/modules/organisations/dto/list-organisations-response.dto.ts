import { ListOrganisationsResponseSchema } from '@repo/contracts/organisations';
import { createZodDto } from 'nestjs-zod';
export class ListOrganisationsResponseDto extends createZodDto(ListOrganisationsResponseSchema) {}
