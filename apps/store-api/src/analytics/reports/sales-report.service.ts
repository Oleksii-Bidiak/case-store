import { ForbiddenException, Injectable } from '@nestjs/common';
import { PermissionService, type PermissionActor } from '../../auth/permissions';
import { PeriodQueryDto } from './dto/period-query.dto';
import { SalesReportEntity } from './entities/sales-report.entity';
import { ReportCache } from './report-cache';
import { resolveReportPeriod } from './report-period';
import { SalesRepository } from './sales.repository';

/**
 * «Продажі за період» (TASK-686, plan 188).
 *
 * Resolves the period (an unanswerable range is the resolver's 400, before any
 * query runs), then asks the repository for the chosen range, its comparison
 * and the chosen range's daily series, and derives net and average order value
 * in {@link SalesReportEntity.from}.
 *
 * `hasRevenue` is always `true` in the cache key because the whole report is
 * money: the route requires `analytics:revenue`, and there is no reduced answer
 * for an actor without it (owner decision — the report is withheld, not
 * trimmed). The key still carries the flag so it can never collide with a
 * money-free answer another report might one day cache for the same period.
 */
@Injectable()
export class SalesReportService {
  constructor(
    private readonly salesRepository: SalesRepository,
    private readonly reportCache: ReportCache,
    private readonly permissionService: PermissionService,
  ) {}

  /**
   * @throws ForbiddenException without `analytics:revenue` — checked first, so
   *   a refused caller learns nothing, not even whether the period was valid.
   *   (The route's own door is `analytics:read`.)
   */
  async getSalesReport(
    query: PeriodQueryDto,
    actor: PermissionActor,
    now: Date = new Date(),
  ): Promise<SalesReportEntity> {
    if (!this.permissionService.actorHasPermission(actor, 'analytics:revenue')) {
      throw new ForbiddenException('analytics:revenue is required for the sales report');
    }
    const period = resolveReportPeriod(query, now);

    return this.reportCache.getOrCompute(
      { report: 'sales', period, hasRevenue: true },
      async () => {
        const [current, previous, daily] = await Promise.all([
          this.salesRepository.getTotals(period.current),
          this.salesRepository.getTotals(period.previous),
          this.salesRepository.getDaily(period.current),
        ]);
        return SalesReportEntity.from(period, current, previous, daily);
      },
    );
  }
}
