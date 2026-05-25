import { CreateRankHistorySchema } from '@repo/contracts/rank-history';
import { createZodDto } from 'nestjs-zod';
export class CreateRankHistoryDto extends createZodDto(CreateRankHistorySchema) {}
