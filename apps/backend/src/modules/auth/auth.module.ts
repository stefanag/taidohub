import { Module } from '@nestjs/common';

import { AuthController } from './auth.controller';

/**
 * Wraps the documentation-only `AuthController`. The actual `/api/auth/*`
 * routing is handled at the Express layer in `main.ts`.
 */
@Module({
  controllers: [AuthController],
})
export class AuthDocsModule {}
