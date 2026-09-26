import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { UmamiClient } from './umami.client';
import { AdminAnalyticsController } from './admin-analytics.controller';
import { FunnelReportController } from './funnel-report.controller';
import { FunnelReportService } from './funnel-report.service';
import { ReportsModule } from './reports/reports.module';

/**
 * Analytics module (TASK-380) — read-only proxy in front of the self-hosted
 * Umami instance, so the admin dashboard can show traffic without the browser
 * ever holding an analytics credential.
 *
 * No database dependency here: everything in this module comes from the
 * analytics vendor — the traffic card and the funnel report (TASK-689), which
 * share one `UmamiClient` and so one login token. The `/analytics` reports over
 * our own tables (plan 188) live in the nested {@link ReportsModule}, whose
 * period resolver and cache the funnel borrows.
 */
@Module({
  imports: [ReportsModule],
  controllers: [AdminAnalyticsController, FunnelReportController],
  providers: [AnalyticsService, UmamiClient, FunnelReportService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
