import { UpdateBeltRankSchema } from '@repo/contracts/ranks';
import { createZodDto } from 'nestjs-zod';
export class UpdateBeltRankDto extends createZodDto(UpdateBeltRankSchema) {}
