import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { UmamiClient } from './umami.client';
import { AdminAnalyticsController } from './admin-analytics.controller';

/**
 * Analytics module (TASK-380) — read-only proxy in front of the self-hosted
 * Umami instance, so the admin dashboard can show traffic without the browser
 * ever holding an analytics credential.
 *
 * No database dependency: everything here comes from the analytics vendor.
 */
@Module({
  controllers: [AdminAnalyticsController],
  providers: [AnalyticsService, UmamiClient],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
