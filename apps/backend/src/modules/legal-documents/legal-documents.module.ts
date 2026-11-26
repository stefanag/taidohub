import { Module } from '@nestjs/common';

import { MembershipsModule } from '../memberships/memberships.module.js';
import { OrganisationsModule } from '../organisations/organisations.module.js';

import { LegalDocumentsController } from './legal-documents.controller.js';
import { LegalDocumentsRepository } from './legal-documents.repository.js';
import { LegalDocumentsService } from './legal-documents.service.js';
import { LegalController } from './legal.controller.js';

/**
 * Terms of use and privacy notices.
 *
 * `DatabaseModule`, `AbilityModule`, `AuditLogModule` and the infrastructure
 * `AuthModule` (for `VerificationTokenService`) are global. Organisations and
 * memberships are reached through their services only: ancestor chains for
 * text inheritance, and a user's organisations for which texts apply.
 * `LegalDocumentsAbilityRules` is provided in `AbilityModule` with the other
 * contributors.
 *
 * `LegalDocumentsService` is exported so the set-password flow (and later
 * registration and club joining) can record acknowledgements in their own
 * transactions.
 */
@Module({
  imports: [OrganisationsModule, MembershipsModule],
  controllers: [LegalDocumentsController, LegalController],
  providers: [LegalDocumentsService, LegalDocumentsRepository],
  exports: [LegalDocumentsService],
})
export class LegalDocumentsModule {}
