import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const DeleteMembershipQuerySchema = z.object({
  confirm: z.coerce.boolean().optional(),
});

export class DeleteMembershipQueryDto extends createZodDto(DeleteMembershipQuerySchema) {}
