import { Module } from '@nestjs/common';

import { LegalDocumentsModule } from '../legal-documents/legal-documents.module.js';
import { OrganisationsModule } from '../organisations/organisations.module.js';
import { ProfileModule } from '../profile/profile.module.js';
import { RankHistoryModule } from '../rank-history/rank-history.module.js';
import { UsersModule } from '../users/users.module.js';

import { OwnAccountController } from './own-account.controller.js';
import { RegistrationController } from './registration.controller.js';
import { RegistrationService } from './registration.service.js';

/**
 * Self-registration and deleting one's own account. Everything it needs from
 * other modules goes through their services: federations (organisations),
 * the self-registered profile (profile), the platform's texts and the
 * acknowledgement log (legal-documents), and, for account deletion, the
 * user's own grading history and the user row (rank-history, users).
 * `DatabaseModule` (used only for the transaction), the infrastructure
 * `AuthModule` (better-auth), `AuditLogModule` and `FeatureFlagsModule`'s
 * guard are global. No CASL subject: registration is public, and account
 * deletion only ever acts on the caller.
 */
@Module({
  imports: [
    LegalDocumentsModule,
    OrganisationsModule,
    ProfileModule,
    RankHistoryModule,
    UsersModule,
  ],
  controllers: [RegistrationController, OwnAccountController],
  providers: [RegistrationService],
})
export class RegistrationModule {}
