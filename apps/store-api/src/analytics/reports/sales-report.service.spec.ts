import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import {
  PermissionRepository,
  PermissionService,
  type PermissionActor,
} from '../../auth/permissions';
import { ReportCache } from './report-cache';
import { SalesReportService } from './sales-report.service';
import { SalesDay, SalesRepository, SalesTotals } from './sales.repository';

/**
 * The sales report's arithmetic (TASK-686): what the service derives from the
 * repository's raw totals — net, average order value, the comparison with the
 * previous range — and how it asks the cache. The SQL behind the totals is
 * pinned on a real database in `test/analytics-sales.repository.int-spec.ts`.
 */
describe('SalesReportService (TASK-686)', () => {
  const NOW = new Date('2026-09-26T12:00:00.000Z');
  const AUGUST = { preset: 'custom' as const, from: '2026-08-01', to: '2026-08-31' };
  const ACTOR: PermissionActor = {
    id: 'manager-1',
    email: 'manager@example.com',
    role: UserRole.MANAGER,
    isOwner: false,
    permissions: new Set(['analytics:read', 'analytics:revenue']),
  };

  const salesRepository = {
    getTotals: jest.fn<Promise<SalesTotals>, [unknown]>(),
    getDaily: jest.fn<Promise<SalesDay[]>, [unknown]>(),
  };
  // Pass-through: compute every time, so the arithmetic is what is observed.
  const reportCache = {
    getOrCompute: jest.fn((_parts: unknown, compute: () => Promise<unknown>) => compute()),
  };

  let service: SalesReportService;

  /** Hand `current` to the requested range and `previous` to the comparison. */
  function totals(current: SalesTotals, previous: SalesTotals) {
    salesRepository.getTotals.mockImplementation(async (range) =>
      (range as { fromDay: string }).fromDay === AUGUST.from ? current : previous,
    );
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    salesRepository.getDaily.mockResolvedValue([]);

    const moduleRef = await Test.createTestingModule({
      providers: [
        SalesReportService,
        // The real level rules (owner/ADMIN by level, MANAGER by key).
        PermissionService,
        { provide: PermissionRepository, useValue: {} },
        { provide: SalesRepository, useValue: salesRepository },
        { provide: ReportCache, useValue: reportCache },
      ],
    }).compile();
    service = moduleRef.get(SalesReportService);
  });

  it('refuses a reader without analytics:revenue before touching anything', async () => {
    const readerOnly = { ...ACTOR, permissions: new Set(['analytics:read']) };

    await expect(service.getSalesReport(AUGUST, readerOnly, NOW)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(reportCache.getOrCompute).not.toHaveBeenCalled();
    expect(salesRepository.getTotals).not.toHaveBeenCalled();
  });

  it('compares every number with the previous equal range', async () => {
    totals({ sales: 1000.1, refunds: 300.05, orders: 4 }, { sales: 500, refunds: 0, orders: 2 });

    const report = await service.getSalesReport(AUGUST, ACTOR, NOW);

    expect(report.sales).toEqual({ current: 1000.1, previous: 500, changePct: 100 });
    expect(report.refunds).toEqual({ current: 300.05, previous: 0, changePct: null });
    expect(report.net).toEqual({ current: 700.05, previous: 500, changePct: 40 });
    expect(report.orders).toEqual({ current: 4, previous: 2, changePct: 100 });
    // Net ÷ orders: 700.05 / 4 = 175.0125 → 175.01; 500 / 2 = 250.
    expect(report.averageOrderValue).toEqual({ current: 175.01, previous: 250, changePct: -30 });
  });

  it('asks the repository for the chosen range and its comparison, and the series of the chosen one', async () => {
    totals({ sales: 0, refunds: 0, orders: 0 }, { sales: 0, refunds: 0, orders: 0 });

    const report = await service.getSalesReport(AUGUST, ACTOR, NOW);

    const asked = salesRepository.getTotals.mock.calls.map(([range]) => range);
    expect(asked).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fromDay: '2026-08-01', toDay: '2026-08-31' }),
        expect.objectContaining({ fromDay: '2026-07-01', toDay: '2026-07-31' }),
      ]),
    );
    expect(salesRepository.getDaily).toHaveBeenCalledWith(
      expect.objectContaining({ fromDay: '2026-08-01', toDay: '2026-08-31' }),
    );
    expect(report.period).toEqual({
      preset: 'custom',
      from: '2026-08-01',
      to: '2026-08-31',
      days: 31,
      previousFrom: '2026-07-01',
      previousTo: '2026-07-31',
      previousDays: 31,
    });
  });

  it('reports an average order value of 0, not NaN or −∞, when there were no orders', async () => {
    // A month with only a refund: net is negative, the order count is zero.
    totals({ sales: 0, refunds: 100, orders: 0 }, { sales: 0, refunds: 0, orders: 0 });

    const report = await service.getSalesReport(AUGUST, ACTOR, NOW);

    expect(report.net.current).toBe(-100);
    expect(report.averageOrderValue).toEqual({ current: 0, previous: 0, changePct: null });
  });

  it('keeps kopecks exact when subtracting refunds', async () => {
    totals({ sales: 0.3, refunds: 0.1, orders: 1 }, { sales: 0, refunds: 0, orders: 0 });

    const report = await service.getSalesReport(AUGUST, ACTOR, NOW);

    expect(report.net.current).toBe(0.2);
    expect(report.averageOrderValue.current).toBe(0.2);
  });

  it('passes the daily series through, one point per day', async () => {
    totals({ sales: 0, refunds: 0, orders: 0 }, { sales: 0, refunds: 0, orders: 0 });
    const daily: SalesDay[] = [
      { date: '2026-08-01', sales: 120, refunds: 0, net: 120 },
      { date: '2026-08-02', sales: 0, refunds: 40, net: -40 },
    ];
    salesRepository.getDaily.mockResolvedValue(daily);

    const report = await service.getSalesReport(AUGUST, ACTOR, NOW);

    expect(report.daily).toEqual(daily);
  });

  it('caches under the sales report with the money right in the key', async () => {
    totals({ sales: 0, refunds: 0, orders: 0 }, { sales: 0, refunds: 0, orders: 0 });

    await service.getSalesReport(AUGUST, ACTOR, NOW);

    expect(reportCache.getOrCompute).toHaveBeenCalledWith(
      expect.objectContaining({
        report: 'sales',
        hasRevenue: true,
        period: expect.objectContaining({ preset: 'custom' }),
      }),
      expect.any(Function),
    );
  });

  it('returns plain JSON, because the cache serialises it', async () => {
    totals({ sales: 10, refunds: 1, orders: 1 }, { sales: 5, refunds: 0, orders: 1 });
    salesRepository.getDaily.mockResolvedValue([
      { date: '2026-08-01', sales: 10, refunds: 1, net: 9 },
    ]);

    const report = await service.getSalesReport(AUGUST, ACTOR, NOW);

    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });

  it('lets the resolver’s 400 through without touching the database', async () => {
    await expect(
      service.getSalesReport(
        { preset: 'custom', from: '2026-09-10', to: '2026-09-01' },
        ACTOR,
        NOW,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(salesRepository.getTotals).not.toHaveBeenCalled();
    expect(salesRepository.getDaily).not.toHaveBeenCalled();
  });
});
