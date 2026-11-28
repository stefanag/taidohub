import { Module } from '@nestjs/common';

import { LegalDocumentsModule } from '../legal-documents/legal-documents.module.js';
import { MembershipsModule } from '../memberships/memberships.module.js';
import { ProfileModule } from '../profile/profile.module.js';
import { ProgressModule } from '../progress/progress.module.js';
import { RankHistoryModule } from '../rank-history/rank-history.module.js';
import { TrainingLogModule } from '../training-log/training-log.module.js';
import { UsersModule } from '../users/users.module.js';

import { AccountExportController } from './account-export.controller.js';
import { AccountExportService } from './account-export.service.js';

/**
 * The user's own data export (self-registration plan, phase 3). Owns no
 * tables: it reads through each owning module's exported service. Nothing is
 * exported.
 */
@Module({
  imports: [
    UsersModule,
    ProfileModule,
    MembershipsModule,
    RankHistoryModule,
    ProgressModule,
    TrainingLogModule,
    LegalDocumentsModule,
  ],
  controllers: [AccountExportController],
  providers: [AccountExportService],
})
export class AccountExportModule {}
