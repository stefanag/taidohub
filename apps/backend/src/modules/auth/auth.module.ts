import { Module } from '@nestjs/common';

import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

/**
 * Wraps the `AuthController`. Most `/api/auth/*` routing is handled at the
 * Express layer in `main.ts`; the one real Nest-handled route is
 * `POST /api/auth/set-initial-password`, backed by `AuthService`.
 */
@Module({
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthDocsModule {}
