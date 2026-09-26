import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma';
import { ReportCache } from './report-cache';
import { ReportsController } from './reports.controller';
import { SalesReportService } from './sales-report.service';
import { SalesRepository } from './sales.repository';

/**
 * `/analytics` reports (plan 188, TASK-685…690).
 *
 * Controller → service → repository like every feature module; the shared
 * pieces live here from the start — the period resolver (`report-period.ts`,
 * also used by the dashboard, TASK-694) and the cache whose key carries the
 * caller's money right (`report-cache.ts`). `CacheService` comes from the
 * global `RedisCacheModule`.
 *
 * `SalesRepository` is exported because the dashboard's revenue tile moves onto
 * the same formula (TASK-694): one query answers "how much did I earn" on both
 * screens, or the two screens give two answers.
 */
@Module({
  imports: [PrismaModule],
  controllers: [ReportsController],
  providers: [ReportCache, SalesRepository, SalesReportService],
  exports: [ReportCache, SalesRepository],
})
export class ReportsModule {}
