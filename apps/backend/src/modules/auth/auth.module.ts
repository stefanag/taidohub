import { Module } from '@nestjs/common';

import { LegalDocumentsModule } from '../legal-documents/legal-documents.module.js';

import { AccountController } from './account.controller.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

/**
 * `AuthController` is documentation-only — `/api/auth/*` is served by
 * better-auth at the Express layer in `main.ts`. `AccountController` is the
 * real Nest-handled `POST /api/account/set-password` route, backed by
 * `AuthService`.
 */
@Module({
  imports: [LegalDocumentsModule],
  controllers: [AuthController, AccountController],
  providers: [AuthService],
})
export class AuthDocsModule {}
