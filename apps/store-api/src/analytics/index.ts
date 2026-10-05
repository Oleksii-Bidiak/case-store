export { AnalyticsModule } from './analytics.module';
export { AnalyticsService } from './analytics.service';
export { UmamiClient } from './umami.client';
export type { UmamiStatsRaw, UmamiMetric } from './umami.client';
export { TrafficSummaryEntity } from './entities/traffic-summary.entity';
// The reports sub-module. The dashboard reuses its aggregate queries (both are
// in `ReportsModule.exports`) instead of deriving revenue and leaders a second way.
export { ReportsModule } from './reports/reports.module';
export { SalesRepository } from './reports/sales.repository';
export { ProductsReportRepository } from './reports/products-report.repository';
export { lastKyivDays, type ReportRange } from './reports/report-period';
export { roundMoney } from './reports/entities/report-common.entity';
