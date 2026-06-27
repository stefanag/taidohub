import { Module } from '@nestjs/common';

import { FeatureFlagsModule } from '../feature-flags/feature-flags.module.js';

import { FeedbackAccessPolicy } from './feedback.access-policy.js';
import { FeedbackController } from './feedback.controller.js';
import { FeedbackRepository } from './feedback.repository.js';
import { FeedbackService } from './feedback.service.js';

/**
 * `DatabaseModule` and `AbilityModule` are `@Global` so they don't need
 * an explicit `imports` entry. `FeatureFlagsModule` is imported because
 * `RequireFeatureFlag` is consumed at the route level and the guard
 * reads the live flag map from the feature-flags repository — Nest
 * picks it up via the global guard registration but the explicit
 * import keeps the dependency graph honest (and the e2e tests need it).
 */
@Module({
  imports: [FeatureFlagsModule],
  controllers: [FeedbackController],
  providers: [FeedbackRepository, FeedbackService, FeedbackAccessPolicy],
  exports: [FeedbackService],
})
export class FeedbackModule {}
