import { BadRequestException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { OrderStatus, PaymentStatus, ReturnStatus } from '@prisma/client';
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
 * Integration test for the refund ceilings on returns (TASK-785) — the REAL
 * service and repositories against a REAL Postgres, because the order-balance
 * ceiling is a sum across returns and only a lock makes it hold between two
 * simultaneous resolves. It also proves the raw `SELECT total … FOR UPDATE`
 * against the real `orders` table, which every mocked spec takes on faith.
 *
 * Fixture: two units at 100.00 bought for 150.00 after a 50.00 order discount,
 * returned as two separate returns of one unit each, both RECEIVED.
 *
 * Requires an isolated `*_test` database (setup-int.ts forces DATABASE_URL).
 */
describe('ReturnService.resolveReturn — refund ceilings (integration)', () => {
  let prisma: PrismaService;
  let service: ReturnService;

  let userId: string;
  let categoryId: string;
  let productId: string;
  let orderId: string;
  let returnA: string;
  let returnB: string;

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

  beforeEach(async () => {
    const suffix = randomUUID().slice(0, 8);

    const category = await prisma.category.create({
      data: { name: `cat-${suffix}`, slug: `cat-${suffix}` },
    });
    categoryId = category.id;

    const product = await prisma.product.create({
      data: { name: `prod-${suffix}`, slug: `prod-${suffix}`, price: 100, stock: 5, categoryId },
    });
    productId = product.id;

    const user = await prisma.user.create({
      data: { email: `refund-cap-${suffix}@test.local`, passwordHash: 'x' },
    });
    userId = user.id;

    const order = await prisma.order.create({
      data: {
        userId,
        status: OrderStatus.DELIVERED,
        paymentStatus: PaymentStatus.PAID,
        subtotal: 200,
        discount: 50,
        total: 150,
        shippingCost: 0,
        shippingAddress: { city: 'Київ', warehouse: '1' },
        items: { create: [{ productId, quantity: 2, price: 100 }] },
      },
      include: { items: true },
    });
    orderId = order.id;
    const orderItemId = order.items[0].id;

    const openReturn = async () =>
      (
        await prisma.return.create({
          data: {
            orderId,
            status: ReturnStatus.RECEIVED,
            createdByUserId: userId,
            items: { create: [{ orderItemId, quantity: 1 }] },
          },
        })
      ).id;
    returnA = await openReturn();
    returnB = await openReturn();
  });

  afterEach(async () => {
    // Scoped to THIS test's rows, and never with an unset id — Prisma drops
    // `{ id: undefined }` and would delete every row on the shared store_test.
    if (!prisma) return;
    if (orderId) await prisma.return.deleteMany({ where: { orderId } });
    if (userId) {
      await prisma.orderStatusHistory.deleteMany({ where: { order: { userId } } });
      await prisma.orderItem.deleteMany({ where: { order: { userId } } });
      await prisma.order.deleteMany({ where: { userId } });
    }
    if (productId) await prisma.product.deleteMany({ where: { id: productId } });
    if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    userId = productId = categoryId = orderId = returnA = returnB = '';
  });

  const refund = (returnId: string, refundedAmount: string) =>
    service.resolveReturn(returnId, { status: ReturnStatus.REFUNDED, refundedAmount });

  const refundedOnOrder = async () =>
    (
      await prisma.return.aggregate({ where: { orderId }, _sum: { refundedAmount: true } })
    )._sum.refundedAmount?.toString() ?? '0';

  it('refuses "10000" typed for "100.00" and stores nothing', async () => {
    await expect(refund(returnA, '10000')).rejects.toThrow(BadRequestException);

    const row = await prisma.return.findUniqueOrThrow({ where: { id: returnA } });
    expect(row.refundedAmount).toBeNull();
    expect(row.status).toBe(ReturnStatus.RECEIVED);
  });

  it('caps the second refund by what the discounted order has left', async () => {
    await expect(refund(returnA, '100.00')).resolves.toBeDefined();

    // 150.00 paid, 100.00 back: 50.00 left, although this unit is worth 100.00.
    await expect(refund(returnB, '100.00')).rejects.toThrow(BadRequestException);
    await expect(refund(returnB, '50.00')).resolves.toBeDefined();
    expect(await refundedOnOrder()).toBe('150');
  });

  it('lets only one of two concurrent full-unit refunds spend the same balance', async () => {
    const results = await Promise.allSettled([
      refund(returnA, '100.00'),
      refund(returnB, '100.00'),
    ]);

    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(BadRequestException);
    expect(await refundedOnOrder()).toBe('100');
  });
});
