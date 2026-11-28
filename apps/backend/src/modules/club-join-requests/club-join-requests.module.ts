import { Module } from '@nestjs/common';

import { MembershipsModule } from '../memberships/memberships.module.js';
import { OrganisationsModule } from '../organisations/organisations.module.js';
import { RankHistoryModule } from '../rank-history/rank-history.module.js';

import { ClubJoinRequestAbilityRules } from './club-join-requests.abilities.js';
import { ClubJoinRequestsController } from './club-join-requests.controller.js';
import { ClubJoinRequestsRepository } from './club-join-requests.repository.js';
import { ClubJoinRequestsService } from './club-join-requests.service.js';

/**
 * Club join requests (self-registration plan, phase 3).
 *
 * Imports: OrganisationsModule (list clubs, check the target is a club),
 * MembershipsModule (approval adds the student membership in the same
 * transaction), RankHistoryModule (the applicant's current rank). Database,
 * ability and feature-flag guard are global. Nothing is exported.
 */
@Module({
  imports: [OrganisationsModule, MembershipsModule, RankHistoryModule],
  controllers: [ClubJoinRequestsController],
  providers: [ClubJoinRequestsRepository, ClubJoinRequestsService, ClubJoinRequestAbilityRules],
})
export class ClubJoinRequestsModule {}
