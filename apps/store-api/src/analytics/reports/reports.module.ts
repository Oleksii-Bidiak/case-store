import { Module } from '@nestjs/common';
import { ReportCache } from './report-cache';

/**
 * `/analytics` reports (plan 188, TASK-685…690).
 *
 * Controller → service → repository like every feature module; the shared
 * pieces live here from the start — the period resolver (`report-period.ts`,
 * also used by the dashboard, TASK-694) and the cache whose key carries the
 * caller's money right (`report-cache.ts`). `CacheService` comes from the
 * global `RedisCacheModule`.
 */
@Module({
  providers: [ReportCache],
  exports: [ReportCache],
})
export class ReportsModule {}
