import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { UmamiClient } from './umami.client';
import { AdminAnalyticsController } from './admin-analytics.controller';
import { ReportsModule } from './reports/reports.module';

/**
 * Analytics module (TASK-380) — read-only proxy in front of the self-hosted
 * Umami instance, so the admin dashboard can show traffic without the browser
 * ever holding an analytics credential.
 *
 * No database dependency here: everything in this module comes from the
 * analytics vendor. The `/analytics` reports over our own tables (plan 188)
 * live in the nested {@link ReportsModule}.
 */
@Module({
  imports: [ReportsModule],
  controllers: [AdminAnalyticsController],
  providers: [AnalyticsService, UmamiClient],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
