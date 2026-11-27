import { Injectable } from '@nestjs/common';
import { type AccountExport } from '@repo/contracts/account-export';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { LegalDocumentsService } from '../legal-documents/legal-documents.service.js';
import { MembershipsService } from '../memberships/memberships.service.js';
import { ProfileService } from '../profile/profile.service.js';
import { ProgressService } from '../progress/progress.service.js';
import { RankHistoryService } from '../rank-history/rank-history.service.js';
import { TrainingLogService } from '../training-log/training-log.service.js';
import { UsersService } from '../users/users.service.js';

/**
 * Assembles the signed-in user's own data from the owning modules' services,
 * each called with the user as actor, so the export never contains more than
 * the user could read one screen at a time.
 */
@Injectable()
export class AccountExportService {
  constructor(
    private readonly users: UsersService,
    private readonly profile: ProfileService,
    private readonly memberships: MembershipsService,
    private readonly rankHistory: RankHistoryService,
    private readonly progress: ProgressService,
    private readonly trainingLog: TrainingLogService,
    private readonly legal: LegalDocumentsService,
  ) {}

  async export(actor: AuthenticatedUser): Promise<AccountExport> {
    const [
      account,
      profile,
      memberships,
      gradingHistory,
      progress,
      trainingSessions,
      trainingGoal,
      acks,
    ] = await Promise.all([
      this.users.findOne(actor.id, actor),
      this.profile.getOwn(actor),
      this.memberships.list({ userId: actor.id }, actor),
      this.rankHistory.list(actor.id, actor),
      this.progress.list(actor),
      this.trainingLog.list(actor, {}),
      this.trainingLog.getGoal(actor),
      this.legal.listOwnAcknowledgements(actor.id),
    ]);
    return {
      exportedAt: new Date().toISOString(),
      account: {
        id: account.id,
        email: account.email,
        name: account.name,
        locale: actor.locale ?? null,
        createdAt: account.createdAt,
      },
      profile,
      memberships: memberships.data,
      gradingHistory,
      progress,
      trainingSessions,
      trainingGoal,
      legalAcknowledgements: acks,
    };
  }
}
