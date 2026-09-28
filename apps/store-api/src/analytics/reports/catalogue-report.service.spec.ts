import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import {
  PermissionRepository,
  PermissionService,
  type PermissionActor,
} from '../../auth/permissions';
import { CatalogueReportService } from './catalogue-report.service';
import { BrandSalesRow, CatalogueRepository, CategorySalesRow } from './catalogue.repository';
import { ReportCache } from './report-cache';

/**
 * TASK-687: the catalogue report's service — the money cut, the merge of the
 * two ranges, the ranking. The SQL is pinned in
 * `test/analytics-catalogue.repository.int-spec.ts`.
 */
describe('CatalogueReportService (TASK-687)', () => {
  const NOW = new Date('2026-09-26T12:00:00.000Z');
  const AUGUST = { preset: 'custom' as const, from: '2026-08-01', to: '2026-08-31' };

  const actor = (permissions: string[]): PermissionActor => ({
    id: 'manager-1',
    email: 'm@example.com',
    role: UserRole.MANAGER,
    isOwner: false,
    permissions: new Set(permissions),
  });
  const reader = actor(['analytics:read']);
  const withMoney = actor(['analytics:read', 'analytics:revenue']);

  const cat = (id: string, sales: Partial<CategorySalesRow> = {}): CategorySalesRow => ({
    categoryId: id,
    name: id,
    direct: false,
    hasChildren: false,
    units: 0,
    orders: 0,
    revenue: 0,
    ...sales,
  });

  const repository = {
    getCategorySales: jest.fn<Promise<CategorySalesRow[]>, [{ fromDay: string }, string | null]>(),
    getBrandSales: jest.fn<Promise<BrandSalesRow[]>, [{ fromDay: string }]>(),
    categoryExists: jest.fn<Promise<boolean>, [string]>(),
  };
  const reportCache = {
    getOrCompute: jest.fn((_parts: unknown, compute: () => Promise<unknown>) => compute()),
  };
  let service: CatalogueReportService;

  /** `current` for the chosen range, `previous` for the comparison. */
  function categories(current: CategorySalesRow[], previous: CategorySalesRow[]) {
    repository.getCategorySales.mockImplementation(async (range) =>
      range.fromDay === AUGUST.from ? current : previous,
    );
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    repository.categoryExists.mockResolvedValue(true);
    const moduleRef = await Test.createTestingModule({
      providers: [
        CatalogueReportService,
        PermissionService,
        { provide: PermissionRepository, useValue: {} },
        { provide: CatalogueRepository, useValue: repository },
        { provide: ReportCache, useValue: reportCache },
      ],
    }).compile();
    service = moduleRef.get(CatalogueReportService);
  });

  it('gives money to a holder of analytics:revenue, ranked by it', async () => {
    categories(
      [
        cat('a', { units: 10, orders: 5, revenue: 100 }),
        cat('b', { units: 2, orders: 2, revenue: 900 }),
      ],
      [cat('a', { units: 5, orders: 5, revenue: 50 })],
    );

    const report = await service.getCategoryReport(AUGUST, withMoney, NOW);

    expect(report.rows.map((r) => r.categoryId)).toEqual(['b', 'a']);
    expect(report.rows[1]).toMatchObject({
      units: { current: 10, previous: 5, changePct: 100 },
      revenue: { current: 100, previous: 50, changePct: 100 },
    });
    expect(report.basis).toBe('current-catalogue');
    expect(report.parentId).toBeNull();
  });

  it('cuts every revenue key without analytics:revenue and ranks by units instead', async () => {
    categories(
      [
        cat('a', { units: 10, orders: 5, revenue: 100 }),
        cat('b', { units: 2, orders: 2, revenue: 900 }),
      ],
      [],
    );

    const report = await service.getCategoryReport(AUGUST, reader, NOW);

    expect(report.rows.map((r) => r.categoryId)).toEqual(['a', 'b']);
    for (const row of report.rows) expect(row).not.toHaveProperty('revenue');
    expect(JSON.stringify(report)).not.toContain('revenue');
  });

  it('puts the actor’s right into the cache key', async () => {
    categories([], []);
    await service.getCategoryReport(AUGUST, reader, NOW);
    await service.getCategoryReport({ ...AUGUST, parentId: 'p-1' }, withMoney, NOW);

    expect(reportCache.getOrCompute).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ report: 'categories', hasRevenue: false, extra: 'parent=root' }),
      expect.any(Function),
    );
    expect(reportCache.getOrCompute).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ hasRevenue: true, extra: 'parent=p-1' }),
      expect.any(Function),
    );
  });

  it('keeps a row that sold only in the comparison range, at zero now', async () => {
    categories([cat('a', { units: 1 })], [cat('gone', { units: 7, orders: 3 })]);

    const report = await service.getCategoryReport(AUGUST, reader, NOW);

    expect(report.rows.find((r) => r.categoryId === 'gone')).toMatchObject({
      units: { current: 0, previous: 7, changePct: -100 },
    });
  });

  it('closes an expansion with the «directly here» row, kept apart from the subtree row', async () => {
    categories(
      [cat('parent', { direct: true, units: 50 }), cat('child', { units: 1 })],
      [cat('parent', { direct: true, units: 5 })],
    );

    const report = await service.getCategoryReport({ ...AUGUST, parentId: 'parent' }, reader, NOW);

    expect(report.rows.map((r) => [r.categoryId, r.direct])).toEqual([
      ['child', false],
      ['parent', true],
    ]);
    expect(report.rows[1].units).toEqual({ current: 50, previous: 5, changePct: 900 });
  });

  it('answers 404 for an expansion of a category that does not exist', async () => {
    repository.categoryExists.mockResolvedValue(false);

    await expect(
      service.getCategoryReport({ ...AUGUST, parentId: 'nope' }, reader, NOW),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.getCategorySales).not.toHaveBeenCalled();
  });

  it('lists brands with «Без бренду» and without money for a reader', async () => {
    repository.getBrandSales.mockImplementation(async (range) =>
      range.fromDay === AUGUST.from
        ? [
            { brandId: 'apple', name: 'Apple', units: 3, orders: 2, revenue: 900 },
            { brandId: null, name: null, units: 5, orders: 5, revenue: 50 },
          ]
        : [],
    );

    const report = await service.getBrandReport(AUGUST, reader, NOW);

    expect(report.rows.map((r) => r.brandId)).toEqual([null, 'apple']);
    expect(JSON.stringify(report)).not.toContain('revenue');
  });
});
