import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { DeliveryMethod, PaymentMethod, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { OrderRepository } from '../src/order/order.repository';
import { CacheService } from '../src/cache';
import { PrismaService } from '../src/prisma';
import { ProductIndexer } from '../src/search/product-indexer';

/**
 * The delivery filters and facet counts of the admin order list against a REAL
 * Postgres (TASK-648) — the numbers on the chips, not the WHERE that produces
 * them (that is `admin-order-facets.e2e-spec.ts`).
 *
 * Every order made here carries one run-unique guest email, and every query
 * searches by it, so rows other suites left in the test database never count.
 */
describe('OrderRepository — delivery filters and facets (integration, TASK-648)', () => {
  let prisma: PrismaService;
  let repo: OrderRepository;
  const tag = `facets-${randomUUID().slice(0, 8)}`;
  let pointId = '';

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [
        PrismaService,
        OrderRepository,
        { provide: CacheService, useValue: { del: jest.fn(), delByPrefix: jest.fn() } },
        {
          provide: ProductIndexer,
          useValue: {
            index: jest.fn().mockResolvedValue(undefined),
            remove: jest.fn().mockResolvedValue(undefined),
          } satisfies ProductIndexer,
        },
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    repo = moduleRef.get(OrderRepository);
    await prisma.$connect();

    const point = await prisma.pickupPoint.create({
      data: { name: `Точка ${tag}`, city: 'Київ', address: 'вул. Хрещатик, 1' },
    });
    pointId = point.id;

    const make = (
      deliveryMethod: DeliveryMethod,
      paymentMethod: PaymentMethod,
      extra: Partial<Prisma.OrderUncheckedCreateInput> = {},
    ) =>
      prisma.order.create({
        data: {
          subtotal: new Prisma.Decimal('100.00'),
          total: new Prisma.Decimal('100.00'),
          guestEmail: `${tag}@example.com`,
          deliveryMethod,
          paymentMethod,
          ...extra,
        },
      });

    // NP: 2 on delivery + 1 online; PICKUP: 2 on delivery (one at the point);
    // COURIER: 1 online; OTHER: 1 on delivery, plus 1 tombstoned that never counts.
    await make('NOVA_POSHTA', 'ON_DELIVERY');
    await make('NOVA_POSHTA', 'ON_DELIVERY');
    await make('NOVA_POSHTA', 'ONLINE');
    await make('PICKUP', 'ON_DELIVERY', { pickupPointId: pointId });
    await make('PICKUP', 'ON_DELIVERY');
    await make('COURIER', 'ONLINE');
    await make('OTHER', 'ON_DELIVERY');
    await make('OTHER', 'ON_DELIVERY', { deletedAt: new Date() });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.order.deleteMany({ where: { guestEmail: `${tag}@example.com` } });
      await prisma.pickupPoint.deleteMany({ where: { id: pointId } });
      await prisma.$disconnect();
    }
  });

  it('counts every method under the search alone, tombstones excluded', async () => {
    await expect(repo.countByDeliveryMethod({ search: tag })).resolves.toEqual({
      NOVA_POSHTA: 3,
      PICKUP: 2,
      COURIER: 1,
      OTHER: 1,
    });
  });

  it('honours the other filters and ignores its own', async () => {
    await expect(
      repo.countByDeliveryMethod({
        search: tag,
        paymentMethod: PaymentMethod.ON_DELIVERY,
        deliveryMethod: [DeliveryMethod.PICKUP],
      }),
    ).resolves.toEqual({ NOVA_POSHTA: 2, PICKUP: 2, COURIER: 0, OTHER: 1 });
  });

  it('narrows by pickup point', async () => {
    await expect(
      repo.countByDeliveryMethod({ search: tag, pickupPointId: pointId }),
    ).resolves.toEqual({ NOVA_POSHTA: 0, PICKUP: 1, COURIER: 0, OTHER: 0 });
  });

  it('the list applies the method filter the facets ignore', async () => {
    const { total, orders } = await repo.findAll({
      search: tag,
      deliveryMethod: [DeliveryMethod.PICKUP, DeliveryMethod.COURIER],
    });

    expect(total).toBe(3);
    expect(new Set(orders.map((o) => o.deliveryMethod))).toEqual(new Set(['PICKUP', 'COURIER']));
  });
});
