import { Injectable } from '@nestjs/common';
import { PermissionService, type PermissionActor } from '../../auth/permissions';
import {
  DEFAULT_PRODUCTS_REPORT_LIMIT,
  ProductsReportQueryDto,
} from './dto/products-report-query.dto';
import { LeaderRowEntity, ProductsReportEntity } from './entities/products-report.entity';
import {
  ComparedValueEntity,
  ReportPeriodEntity,
  roundMoney,
} from './entities/report-common.entity';
import { ProductsReportRepository, ProductSales } from './products-report.repository';
import { ReportCache } from './report-cache';
import { resolveReportPeriod } from './report-period';

/**
 * «Лідери й аутсайдери» (TASK-688, plan 188).
 *
 * Open under `analytics:read`. Without `analytics:revenue` the leaders are
 * SELECTED by units (not just re-sorted — the top ten by money with the money
 * removed still names who earns most) and carry no `revenue` key; the cache
 * key carries the same right.
 *
 * Each leader is compared with its own sales in the previous range; a leader
 * that did not sell then compares against zeros (`changePct: null`).
 */
@Injectable()
export class ProductsReportService {
  constructor(
    private readonly productsRepository: ProductsReportRepository,
    private readonly reportCache: ReportCache,
    private readonly permissionService: PermissionService,
  ) {}

  async getProductsReport(
    query: ProductsReportQueryDto,
    actor: PermissionActor,
    now: Date = new Date(),
  ): Promise<ProductsReportEntity> {
    const period = resolveReportPeriod(query, now);
    const hasRevenue = this.permissionService.actorHasPermission(actor, 'analytics:revenue');
    const limit = query.limit ?? DEFAULT_PRODUCTS_REPORT_LIMIT;
    const rankedBy = hasRevenue ? 'revenue' : 'units';

    return this.reportCache.getOrCompute(
      { report: 'products', period, hasRevenue, extra: `limit=${limit}` },
      async () => {
        const [leaders, outsiders] = await Promise.all([
          this.productsRepository.getLeaders(period.current, limit, rankedBy),
          this.productsRepository.getOutsiders(period.current, limit),
        ]);
        const previous = await this.productsRepository.getSalesOf(
          period.previous,
          leaders.map((l) => l.productId),
        );
        const before = new Map(previous.map((p) => [p.productId, p]));

        return {
          period: ReportPeriodEntity.from(period),
          rankedBy,
          leaders: leaders.map((row) => leaderRow(row, before.get(row.productId), hasRevenue)),
          outsiders,
        };
      },
    );
  }
}

function leaderRow(
  now: ProductSales,
  before: ProductSales | undefined,
  hasRevenue: boolean,
): LeaderRowEntity {
  const row: LeaderRowEntity = {
    productId: now.productId,
    name: now.name,
    units: ComparedValueEntity.of(now.units, before?.units ?? 0),
    orders: ComparedValueEntity.of(now.orders, before?.orders ?? 0),
  };
  if (hasRevenue) {
    row.revenue = ComparedValueEntity.of(roundMoney(now.revenue), roundMoney(before?.revenue ?? 0));
  }
  return row;
}
