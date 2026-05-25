import { UpdateRankHistorySchema } from '@repo/contracts/rank-history';
import { createZodDto } from 'nestjs-zod';
export class UpdateRankHistoryDto extends createZodDto(UpdateRankHistorySchema) {}
