import { CreateBeltRankSchema } from '@repo/contracts/ranks';
import { createZodDto } from 'nestjs-zod';
export class CreateBeltRankDto extends createZodDto(CreateBeltRankSchema) {}
