import { Module } from '@nestjs/common';

import { BeltCatalogModule } from '../belt-catalog/belt-catalog.module.js';
import { GradingRequirementsModule } from '../grading-requirements/grading-requirements.module.js';
import { OrganisationsModule } from '../organisations/organisations.module.js';
import { PendingOperationsModule } from '../pending-operations/pending-operations.module.js';
import { RankHistoryModule } from '../rank-history/rank-history.module.js';
import { StatisticsModule } from '../statistics/statistics.module.js';
import { StudentsModule } from '../students/students.module.js';

import { McpActorRepository } from './mcp-actor.repository.js';
import { McpHttpService } from './mcp-http.handler.js';
import { McpServerFactory } from './mcp-server.factory.js';
import { McpPendingTools } from './tools/pending.tools.js';
import { McpReadTools } from './tools/read.tools.js';

/**
 * The MCP server at `/api/mcp`.
 *
 * There is no controller: `McpHttpService.nodeHandler()` is mounted with
 * `app.use` in `main.ts` (and `test/helpers/app-factory.ts`), next to
 * better-auth, because MCP requests authenticate with a bearer token that the
 * cookie-based global `AuthGuard` does not read.
 *
 * Imports are the modules whose exported services the tools call; tools never
 * reach into another module's repository. `DatabaseModule`, `AbilityModule`,
 * the infrastructure `AuthModule` (better-auth, `UserContextService`) and
 * `ConfigModule` are global. `McpAbilityRules` is provided in `AbilityModule`
 * with the other rule contributors.
 */
@Module({
  imports: [
    OrganisationsModule,
    StudentsModule,
    RankHistoryModule,
    BeltCatalogModule,
    GradingRequirementsModule,
    StatisticsModule,
    PendingOperationsModule,
  ],
  providers: [McpActorRepository, McpReadTools, McpPendingTools, McpServerFactory, McpHttpService],
  exports: [McpHttpService],
})
export class McpModule {}
