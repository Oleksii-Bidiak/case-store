import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import {
  PermissionRepository,
  PermissionService,
  type PermissionActor,
} from '../../auth/permissions';
import { ProductsReportRepository, ProductSales } from './products-report.repository';
import { ProductsReportService } from './products-report.service';
import { ReportCache } from './report-cache';

/** TASK-688: leaders chosen by the actor's right, compared, and outsiders passed through. */
describe('ProductsReportService (TASK-688)', () => {
  const NOW = new Date('2026-09-26T12:00:00.000Z');
  const AUGUST = { preset: 'custom' as const, from: '2026-08-01', to: '2026-08-31' };

  const actor = (permissions: string[]): PermissionActor => ({
    id: 'manager-1',
    email: 'm@example.com',
    role: UserRole.MANAGER,
    isOwner: false,
    permissions: new Set(permissions),
  });

  const leader: ProductSales = {
    productId: 'p1',
    name: 'Чохол',
    units: 6,
    orders: 3,
    revenue: 1200,
  };
  const outsiders = {
    total: 12,
    rows: [{ productId: 'p9', name: 'Скло', stock: 4, createdAt: '2026-01-01T00:00:00.000Z' }],
  };

  const repository = {
    getLeaders: jest.fn().mockResolvedValue([leader]),
    getSalesOf: jest.fn().mockResolvedValue([{ ...leader, units: 3, orders: 3, revenue: 600 }]),
    getOutsiders: jest.fn().mockResolvedValue(outsiders),
  };
  const reportCache = {
    getOrCompute: jest.fn((_parts: unknown, compute: () => Promise<unknown>) => compute()),
  };
  let service: ProductsReportService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ProductsReportService,
        PermissionService,
        { provide: PermissionRepository, useValue: {} },
        { provide: ProductsReportRepository, useValue: repository },
        { provide: ReportCache, useValue: reportCache },
      ],
    }).compile();
    service = moduleRef.get(ProductsReportService);
  });

  it('chooses leaders by money for a holder of analytics:revenue and shows it', async () => {
    const report = await service.getProductsReport(
      AUGUST,
      actor(['analytics:read', 'analytics:revenue']),
      NOW,
    );

    expect(repository.getLeaders).toHaveBeenCalledWith(
      expect.objectContaining({ fromDay: '2026-08-01' }),
      10,
      'revenue',
    );
    expect(report.rankedBy).toBe('revenue');
    expect(report.leaders[0]).toEqual({
      productId: 'p1',
      name: 'Чохол',
      units: { current: 6, previous: 3, changePct: 100 },
      orders: { current: 3, previous: 3, changePct: 0 },
      revenue: { current: 1200, previous: 600, changePct: 100 },
    });
    expect(report.outsiders).toEqual(outsiders);
  });

  it('chooses leaders by units and cuts every revenue key for a reader', async () => {
    const report = await service.getProductsReport(
      { ...AUGUST, limit: 3 },
      actor(['analytics:read']),
      NOW,
    );

    expect(repository.getLeaders).toHaveBeenCalledWith(expect.anything(), 3, 'units');
    expect(report.rankedBy).toBe('units');
    expect(JSON.stringify(report)).not.toContain('revenue');
    expect(reportCache.getOrCompute).toHaveBeenCalledWith(
      expect.objectContaining({ report: 'products', hasRevenue: false, extra: 'limit=3' }),
      expect.any(Function),
    );
  });

  it('compares a leader that did not sell before against zeros', async () => {
    repository.getSalesOf.mockResolvedValueOnce([]);

    const report = await service.getProductsReport(AUGUST, actor(['analytics:read']), NOW);

    expect(report.leaders[0].units).toEqual({ current: 6, previous: 0, changePct: null });
    expect(repository.getSalesOf).toHaveBeenCalledWith(
      expect.objectContaining({ fromDay: '2026-07-01', toDay: '2026-07-31' }),
      ['p1'],
    );
  });
});
