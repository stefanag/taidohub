import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ZodValidationPipe } from 'nestjs-zod';

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.js';
import { AppConfigModule } from './config/config.module.js';
import { AbilityModule } from './infrastructure/ability/ability.module.js';
import { InfraAuthModule } from './infrastructure/auth/auth.module.js';
import { DatabaseModule } from './infrastructure/database/database.module.js';
import { EmailModule } from './infrastructure/email/email.module.js';
import { AuditLogModule } from './modules/audit-log/audit-log.module.js';
import { AuthDocsModule } from './modules/auth/auth.module.js';
import { BeltCatalogModule } from './modules/belt-catalog/belt-catalog.module.js';
import { ClassificationCategoryModule } from './modules/classification-category/classification-category.module.js';
import { FeatureFlagsModule } from './modules/feature-flags/feature-flags.module.js';
import { FeedbackModule } from './modules/feedback/feedback.module.js';
import { GradingHistoryProjectionModule } from './modules/grading-history-projection/grading-history.module.js';
import { GradingRequirementsModule } from './modules/grading-requirements/grading-requirements.module.js';
import { RankHistoryModule } from './modules/rank-history/rank-history.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { LabelsModule } from './modules/labels/labels.module.js';
import { MembershipsModule } from './modules/memberships/memberships.module.js';
import { OrganisationsModule } from './modules/organisations/organisations.module.js';
import { PatternModule } from './modules/pattern/pattern.module.js';
import { ProfileModule } from './modules/profile/profile.module.js';
import { ProgressModule } from './modules/progress/progress.module.js';
import { StatisticsModule } from './modules/statistics/statistics.module.js';
import { StudentsModule } from './modules/students/students.module.js';
import { TechniqueModule } from './modules/technique/technique.module.js';
import { UserImpersonationModule } from './modules/user-impersonation/user-impersonation.module.js';
import { UsersModule } from './modules/users/users.module.js';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    EmailModule,
    InfraAuthModule,
    AbilityModule,
    AuthDocsModule,
    BeltCatalogModule,
    RankHistoryModule,
    GradingHistoryProjectionModule,
    GradingRequirementsModule,
    HealthModule,
    UsersModule,
    ProfileModule,
    OrganisationsModule,
    MembershipsModule,
    AuditLogModule,
    LabelsModule,
    ClassificationCategoryModule,
    TechniqueModule,
    PatternModule,
    ProgressModule,
    StudentsModule,
    FeatureFlagsModule,
    FeedbackModule,
    UserImpersonationModule,
    StatisticsModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
