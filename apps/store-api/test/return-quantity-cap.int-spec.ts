import { BadRequestException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { randomUUID } from 'crypto';
import { OrderRepository } from '../src/order/order.repository';
import { ReturnRepository } from '../src/order/returns/return.repository';
import { ReturnService } from '../src/order/returns/return.service';
import { ShopNotifier } from '../src/notification/shop-notifier.service';
import { CacheService } from '../src/cache';
import { PrismaService } from '../src/prisma';
import { ProductIndexer } from '../src/search/product-indexer';

/**
 * Integration test for the "no more than was bought" cap on returns (TASK-784)
 * — the REAL service and repositories against a REAL Postgres, because the bug
 * lives only between two simultaneous transactions. A mocked unit test lets
 * both requests "succeed" by construction.
 *
 * The bug: `ReturnService.assertLinesAreReturnable` summed the live claims with
 * a plain read and the insert followed as a separate statement, with nothing in
 * the database (no lock, no unique key, no CHECK) tying the two together. Two
 * "Подати заявку" clicks on the last returnable unit both read "0 claimed",
 * both inserted, and resolving each as RECEIVED with `restock` credited the
 * shop one unit it never got back.
 *
 * Requires an isolated `*_test` database (setup-int.ts forces DATABASE_URL).
 */
describe('ReturnService.createReturn — quantity cap under concurrency (integration)', () => {
  let prisma: PrismaService;
  let service: ReturnService;

  let userId: string;
  let categoryId: string;
  let productId: string;
  let orderId: string;
  let orderItemId: string;

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
        ReturnRepository,
        ReturnService,
        // TASK-677: the shop ping is not what this suite tests.
        {
          provide: ShopNotifier,
          useValue: { enqueueReturnRequested: jest.fn().mockResolvedValue(0) },
        },
        // Caches and search are touched only after a restock commits; neither is
        // part of the guarantee under test.
        { provide: CacheService, useValue: { del: jest.fn(), delByPrefix: jest.fn() } },
        {
          provide: ProductIndexer,
          useValue: {
            index: jest.fn().mockResolvedValue(undefined),
            remove: jest.fn().mockResolvedValue(undefined),
          } satisfies ProductIndexer,
        },
        {
          provide: PinoLogger,
          useValue: { setContext: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(ReturnService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  /** A delivered order for ONE unit — the smallest line where a double claim shows. */
  beforeEach(async () => {
    const suffix = randomUUID().slice(0, 8);

    const category = await prisma.category.create({
      data: { name: `cat-${suffix}`, slug: `cat-${suffix}` },
    });
    categoryId = category.id;

    const product = await prisma.product.create({
      data: {
        name: `prod-${suffix}`,
        slug: `prod-${suffix}`,
        price: 100,
        stock: 5,
        categoryId,
      },
    });
    productId = product.id;

    const user = await prisma.user.create({
      data: { email: `return-cap-${suffix}@test.local`, passwordHash: 'x' },
    });
    userId = user.id;

    const order = await prisma.order.create({
      data: {
        userId,
        status: OrderStatus.DELIVERED,
        paymentStatus: PaymentStatus.SUCCEEDED,
        subtotal: 100,
        total: 100,
        shippingCost: 0,
        shippingAddress: { city: 'Київ', warehouse: '1' },
        items: { create: [{ productId, quantity: 1, price: 100 }] },
      },
      include: { items: true },
    });
    orderId = order.id;
    orderItemId = order.items[0].id;
  });

  afterEach(async () => {
    // Scoped to THIS test's rows, and never with an unset id — Prisma drops
    // `{ id: undefined }` and would delete every row on the shared store_test.
    if (!prisma) return;
    if (orderId) {
      await prisma.return.deleteMany({ where: { orderId } });
    }
    if (userId) {
      await prisma.orderStatusHistory.deleteMany({ where: { order: { userId } } });
      await prisma.orderItem.deleteMany({ where: { order: { userId } } });
      await prisma.order.deleteMany({ where: { userId } });
    }
    if (productId) await prisma.product.deleteMany({ where: { id: productId } });
    if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    userId = productId = categoryId = orderId = orderItemId = '';
  });

  const requestLastUnit = () =>
    service.createReturn(userId, orderId, { items: [{ orderItemId, quantity: 1 }] });

  const claimedUnits = async () =>
    (
      await prisma.returnItem.aggregate({
        where: { orderItemId, return: { orderId } },
        _sum: { quantity: true },
      })
    )._sum.quantity ?? 0;

  it('accepts exactly one of two concurrent requests for the last unit', async () => {
    const results = await Promise.allSettled([requestLastUnit(), requestLastUnit()]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(BadRequestException);
    expect(await prisma.return.count({ where: { orderId } })).toBe(1);
    expect(await claimedUnits()).toBe(1);
  });

  // The same property at a width a double click cannot reach but a retrying
  // client or a script can: however many arrive together, one unit is one claim.
  it('never lets a burst of concurrent requests claim more than was bought', async () => {
    const results = await Promise.allSettled(Array.from({ length: 5 }, requestLastUnit));

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await claimedUnits()).toBe(1);
  });

  it('still refuses a sequential second request once the unit is claimed', async () => {
    await expect(requestLastUnit()).resolves.toBeDefined();
    await expect(requestLastUnit()).rejects.toThrow(BadRequestException);
    expect(await claimedUnits()).toBe(1);
  });
});
