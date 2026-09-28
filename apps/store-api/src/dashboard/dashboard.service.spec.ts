import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { DashboardService } from './dashboard.service';
import { DashboardRepository } from './dashboard.repository';
import { PermissionRepository, PermissionService, type PermissionActor } from '../auth/permissions';
import type { DashboardSummaryBase, RevenueMetrics } from './dashboard.types';

/**
 * Where the money is cut out of the dashboard (TASK-684, plan 188).
 *
 * The admin panel is a public bundle: anything the API sends, the browser's
 * network tab shows, whatever the component decides to render. So the question
 * "may this person see revenue?" is answered HERE, in the service, and the
 * answer "no" has to mean the key is ABSENT from the object — not `null`, not
 * zeros, and not a top-products list still ordered by a revenue it no longer
 * prints (ordering is a ranking of money, and a ranking is information).
 *
 * `PermissionService` is the real one, not a mock: its level rules (owner and
 * admin hold every key without a row, a customer holds none) are exactly what
 * this split relies on, and a mocked `actorHasPermission` would test a rule of
 * our own invention instead.
 */
describe('DashboardService — the revenue split (TASK-684)', () => {
  let service: DashboardService;

  const baseFixture = (): DashboardSummaryBase => ({
    orders: { totalOrders: 3, ordersByStatus: [], ordersByDay: [] },
    users: { totalUsers: 2, newUsersByDay: [] },
    customers: { repeatBuyerRate: 0.5, repeatBuyerRateLast90Days: 0.5 },
    products: {
      totalProducts: 3,
      activeProducts: 3,
      // Ordered by revenue, as the revenue ranking returns them: the cheap
      // cable sold the most units, the expensive case earned the most money.
      topProducts: [
        { productId: 'p-case', name: 'Case', totalRevenue: 900, unitsSold: 1 },
        { productId: 'p-glass', name: 'Glass', totalRevenue: 400, unitsSold: 4 },
        { productId: 'p-cable', name: 'Cable', totalRevenue: 300, unitsSold: 10 },
      ],
    },
    inventory: { lowStockProducts: [] },
    operations: { averageProcessingHoursLast30Days: 12 },
  });

  const revenueFixture: RevenueMetrics = {
    totalRevenue: 1600,
    revenueLast30Days: 1600,
    unrealizedRevenue: 0,
    unrealizedRevenueLast30Days: 0,
    averageOrderValueLast30Days: 533.33,
    revenueByDay: [{ date: '2026-09-26', value: 1600 }],
  };

  const repositoryMock = {
    getSummary: jest.fn(),
    getRevenueMetrics: jest.fn(),
    getNeedsAction: jest.fn(),
  };

  const actor = (overrides: Partial<PermissionActor>): PermissionActor => ({
    id: 'u-1',
    email: 'u@example.com',
    role: UserRole.MANAGER,
    isOwner: false,
    permissions: new Set<string>(),
    ...overrides,
  });

  const operationsOnly = actor({ permissions: new Set(['analytics:read']) });
  const withRevenue = actor({ permissions: new Set(['analytics:read', 'analytics:revenue']) });

  beforeEach(async () => {
    jest.clearAllMocks();
    repositoryMock.getSummary.mockImplementation(async () => baseFixture());
    repositoryMock.getRevenueMetrics.mockResolvedValue(revenueFixture);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        PermissionService,
        { provide: DashboardRepository, useValue: repositoryMock },
        // PermissionService's own dependency; `actorHasPermission` never reads it.
        { provide: PermissionRepository, useValue: {} },
      ],
    }).compile();

    service = module.get(DashboardService);
  });

  describe('a manager holding analytics:read only', () => {
    it('never computes the revenue metrics at all', async () => {
      await service.getSummary(operationsOnly);

      // Not "computed and then dropped": a query that never runs cannot leak
      // through a future refactor that forgets the drop.
      expect(repositoryMock.getRevenueMetrics).not.toHaveBeenCalled();
    });

    it('omits the revenue KEY, rather than sending it empty', async () => {
      const result = await service.getSummary(operationsOnly);

      expect('revenue' in result).toBe(false);
      expect(JSON.stringify(result)).not.toContain('revenue');
    });

    it('strips the money from every top product', async () => {
      const result = await service.getSummary(operationsOnly);

      for (const product of result.products.topProducts) {
        expect('totalRevenue' in product).toBe(false);
      }
    });

    it('ranks the top products by units sold, never by the revenue it no longer shows', async () => {
      const result = await service.getSummary(operationsOnly);

      // A list still ordered case > glass > cable would tell the reader which
      // product earns the most — the one fact the missing key was withholding.
      expect(result.products.topProducts).toEqual([
        { productId: 'p-cable', name: 'Cable', unitsSold: 10 },
        { productId: 'p-glass', name: 'Glass', unitsSold: 4 },
        { productId: 'p-case', name: 'Case', unitsSold: 1 },
      ]);
      expect(repositoryMock.getSummary).toHaveBeenCalledWith({ topProductsRankedBy: 'units' });
    });

    it('keeps every operational block exactly as it was', async () => {
      const result = await service.getSummary(operationsOnly);
      const base = baseFixture();

      expect(result.orders).toEqual(base.orders);
      expect(result.users).toEqual(base.users);
      expect(result.customers).toEqual(base.customers);
      expect(result.inventory).toEqual(base.inventory);
      expect(result.operations).toEqual(base.operations);
    });
  });

  describe('a manager holding analytics:revenue too', () => {
    it('gets the revenue block and the money in the top products, ranked by revenue', async () => {
      const result = await service.getSummary(withRevenue);

      expect(repositoryMock.getRevenueMetrics).toHaveBeenCalledTimes(1);
      expect(repositoryMock.getSummary).toHaveBeenCalledWith({ topProductsRankedBy: 'revenue' });
      expect(result.revenue).toEqual(revenueFixture);
      expect(result.products.topProducts.map((product) => product.productId)).toEqual([
        'p-case',
        'p-glass',
        'p-cable',
      ]);
      expect(result.products.topProducts[0]).toEqual({
        productId: 'p-case',
        name: 'Case',
        totalRevenue: 900,
        unitsSold: 1,
      });
    });
  });

  describe('by level, without a row', () => {
    it.each([
      ['the owner', actor({ role: UserRole.ADMIN, isOwner: true })],
      ['a deputy admin', actor({ role: UserRole.ADMIN, isOwner: false })],
    ])('%s sees the money', async (_label, levelled) => {
      const result = await service.getSummary(levelled);

      expect(result.revenue).toEqual(revenueFixture);
      expect(result.products.topProducts[0].totalRevenue).toBe(900);
    });
  });
});
