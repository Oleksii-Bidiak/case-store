import { Injectable, NotFoundException } from '@nestjs/common';
import { PermissionService, type PermissionActor } from '../../auth/permissions';
import { CatalogueRepository, CatalogueSales, CategorySalesRow } from './catalogue.repository';
import { CategoryReportQueryDto } from './dto/category-report-query.dto';
import { PeriodQueryDto } from './dto/period-query.dto';
import {
  BrandReportEntity,
  BrandReportRowEntity,
  CATALOGUE_BASIS,
  CatalogueFiguresEntity,
  CategoryReportEntity,
  CategoryReportRowEntity,
} from './entities/catalogue-report.entity';
import {
  ComparedValueEntity,
  ReportPeriodEntity,
  roundMoney,
} from './entities/report-common.entity';
import { ReportCache } from './report-cache';
import { resolveReportPeriod } from './report-period';

const NO_SALES: CatalogueSales = { units: 0, orders: 0, revenue: 0 };

/**
 * «Продажі за категорією і брендом» (TASK-687, plan 188).
 *
 * Open under `analytics:read`; the money is cut HERE for anyone without
 * `analytics:revenue` — the `revenue` key is absent from every row, and rows
 * are ranked by units instead (a list ordered by money with the money removed
 * still tells its reader what earns most). The cache key carries the same
 * right, so the two answers never share an entry.
 *
 * Rows of the chosen range and of its comparison are merged by key: a category
 * that sold only in the previous range still appears, with 0 now — that is the
 * row the operator most needs to see.
 */
@Injectable()
export class CatalogueReportService {
  constructor(
    private readonly catalogueRepository: CatalogueRepository,
    private readonly reportCache: ReportCache,
    private readonly permissionService: PermissionService,
  ) {}

  /** @throws NotFoundException when `query.parentId` names no category. */
  async getCategoryReport(
    query: CategoryReportQueryDto,
    actor: PermissionActor,
    now: Date = new Date(),
  ): Promise<CategoryReportEntity> {
    const period = resolveReportPeriod(query, now);
    const parentId = query.parentId ?? null;
    const hasRevenue = this.permissionService.actorHasPermission(actor, 'analytics:revenue');

    if (parentId !== null && !(await this.catalogueRepository.categoryExists(parentId))) {
      throw new NotFoundException('Category not found');
    }

    return this.reportCache.getOrCompute(
      { report: 'categories', period, hasRevenue, extra: `parent=${parentId ?? 'root'}` },
      async () => {
        const [current, previous] = await Promise.all([
          this.catalogueRepository.getCategorySales(period.current, parentId),
          this.catalogueRepository.getCategorySales(period.previous, parentId),
        ]);
        const rows = merge(current, previous, categoryKey).map(
          ({ row, now: n, before }): CategoryReportRowEntity => ({
            categoryId: row.categoryId,
            name: row.name,
            direct: row.direct,
            hasChildren: row.hasChildren,
            ...figures(n, before, hasRevenue),
          }),
        );
        return {
          period: ReportPeriodEntity.from(period),
          basis: CATALOGUE_BASIS,
          parentId,
          // The «directly in this category» row closes the expansion.
          rows: rank(rows, hasRevenue).sort((a, b) => Number(a.direct) - Number(b.direct)),
        };
      },
    );
  }

  async getBrandReport(
    query: PeriodQueryDto,
    actor: PermissionActor,
    now: Date = new Date(),
  ): Promise<BrandReportEntity> {
    const period = resolveReportPeriod(query, now);
    const hasRevenue = this.permissionService.actorHasPermission(actor, 'analytics:revenue');

    return this.reportCache.getOrCompute({ report: 'brands', period, hasRevenue }, async () => {
      const [current, previous] = await Promise.all([
        this.catalogueRepository.getBrandSales(period.current),
        this.catalogueRepository.getBrandSales(period.previous),
      ]);
      const rows = merge(current, previous, (r) => r.brandId ?? '').map(
        ({ row, now: n, before }): BrandReportRowEntity => ({
          brandId: row.brandId,
          name: row.name,
          ...figures(n, before, hasRevenue),
        }),
      );
      return {
        period: ReportPeriodEntity.from(period),
        basis: CATALOGUE_BASIS,
        rows: rank(rows, hasRevenue),
      };
    });
  }
}

function categoryKey(row: CategorySalesRow): string {
  return `${row.categoryId}:${row.direct ? 'direct' : 'subtree'}`;
}

/** Pair each row of the chosen range with its comparison row (either may be missing). */
function merge<T extends CatalogueSales>(
  current: T[],
  previous: T[],
  key: (row: T) => string,
): Array<{ row: T; now: CatalogueSales; before: CatalogueSales }> {
  const before = new Map(previous.map((r) => [key(r), r]));
  const merged = current.map((row) => ({
    row,
    now: row as CatalogueSales,
    before: before.get(key(row)) ?? NO_SALES,
  }));
  const seen = new Set(current.map(key));
  for (const row of previous) {
    if (!seen.has(key(row))) merged.push({ row, now: NO_SALES, before: row });
  }
  return merged;
}

/** Units and orders always; revenue only for an actor who may see money. */
function figures(
  now: CatalogueSales,
  before: CatalogueSales,
  hasRevenue: boolean,
): CatalogueFiguresEntity {
  const base = {
    units: ComparedValueEntity.of(now.units, before.units),
    orders: ComparedValueEntity.of(now.orders, before.orders),
  };
  return hasRevenue
    ? {
        ...base,
        revenue: ComparedValueEntity.of(roundMoney(now.revenue), roundMoney(before.revenue)),
      }
    : base;
}

/** By money with the right, by units without; then by units, then by name — deterministic. */
function rank<T extends CatalogueFiguresEntity & { name: string | null }>(
  rows: T[],
  hasRevenue: boolean,
): T[] {
  return rows.sort(
    (a, b) =>
      (hasRevenue ? (b.revenue?.current ?? 0) - (a.revenue?.current ?? 0) : 0) ||
      b.units.current - a.units.current ||
      (a.name ?? '￿').localeCompare(b.name ?? '￿', 'uk'),
  );
}
