import { Module } from '@nestjs/common';

import { MembershipsModule } from '../memberships/memberships.module.js';
import { OrganisationsModule } from '../organisations/organisations.module.js';
import { UsersModule } from '../users/users.module.js';

import { RankHistoryAuthService } from './rank-history.auth.service.js';
import { RankHistoryController } from './rank-history.controller.js';
import { RankHistoryRepository } from './rank-history.repository.js';
import { RankHistoryService } from './rank-history.service.js';

/**
 * Owns the rank-history HTTP/data layer + the per-row auth service. Exports
 * the repository and the auth service so the grading-history projection
 * (Task 17) can reuse both without re-querying.
 */
@Module({
  imports: [UsersModule, OrganisationsModule, MembershipsModule],
  controllers: [RankHistoryController],
  providers: [RankHistoryService, RankHistoryRepository, RankHistoryAuthService],
  exports: [RankHistoryService, RankHistoryRepository, RankHistoryAuthService],
})
export class RankHistoryModule {}
