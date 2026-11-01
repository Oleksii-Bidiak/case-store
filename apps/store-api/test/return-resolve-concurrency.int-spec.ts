import { HttpException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { OrderStatus, PaymentStatus, ReturnDecision, ReturnStatus, UserRole } from '@prisma/client';
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
 * `PATCH /admin/returns/:id` racing another transition (TASK-1961, TASK-2044) —
 * the REAL service and repositories against a REAL Postgres.
 *
 * `resolveReturn` validates the move against a read taken OUTSIDE the write
 * transaction. If a decision (or another PATCH) commits in between, a write by
 * id alone would overwrite it: a refusal silently turned into "received", or a
 * refund paid out on what had just become a replacement. The write must be
 * conditional on the status and decision the service validated, so of two
 * concurrent transitions exactly one wins and the other gets 409.
 *
 * Most cases force the interleaving deterministically: the service's read
 * returns its snapshot only after the competing transition has committed.
 *
 * Requires an isolated `*_test` database (setup-int.ts forces DATABASE_URL).
 */
describe('ReturnService.resolveReturn — a stale PATCH never overwrites a newer transition (integration)', () => {
  const PRODUCT_STOCK = 5;

  let prisma: PrismaService;
  let service: ReturnService;
  let repository: ReturnRepository;

  let userId: string;
  let operatorId: string;
  let categoryId: string;
  let productId: string;
  let orderId: string;
  let orderItemId: string;
  let returnId: string;

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
    repository = moduleRef.get(ReturnRepository);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  /** A delivered, paid order for ONE unit; the return is created per test. */
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
        stock: PRODUCT_STOCK,
        categoryId,
      },
    });
    productId = product.id;

    const user = await prisma.user.create({
      data: { email: `return-resolve-${suffix}@test.local`, passwordHash: 'x' },
    });
    userId = user.id;

    const operator = await prisma.user.create({
      data: {
        email: `return-resolve-op-${suffix}@test.local`,
        passwordHash: 'x',
        role: UserRole.MANAGER,
      },
    });
    operatorId = operator.id;

    const order = await prisma.order.create({
      data: {
        userId,
        status: OrderStatus.DELIVERED,
        paymentStatus: PaymentStatus.PAID,
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
    jest.restoreAllMocks();
    // Scoped to THIS test's rows, and never with an unset id — Prisma drops
    // `{ id: undefined }` and would delete every row on the shared store_test.
    if (!prisma) return;
    if (orderId) {
      // Decision events cascade with their return.
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
    if (operatorId) await prisma.user.deleteMany({ where: { id: operatorId } });
    userId = operatorId = productId = categoryId = orderId = orderItemId = returnId = '';
  });

  /** A return for the one unit, already decided as a refund. */
  async function seedReturn(status: ReturnStatus): Promise<void> {
    const row = await prisma.return.create({
      data: {
        orderId,
        createdByUserId: userId,
        status,
        decision: ReturnDecision.REFUND,
        decidedById: operatorId,
        decidedAt: new Date(),
        resolvedAt: new Date(),
        items: { create: [{ orderItemId, quantity: 1 }] },
      },
    });
    returnId = row.id;
  }

  /**
   * Run `stale` so that its pre-transaction read of the return is taken BEFORE
   * `meanwhile` runs and acted on AFTER `meanwhile` has committed — the window
   * a real race opens, held open deterministically.
   */
  async function interleave<T>(stale: () => Promise<T>, meanwhile: () => Promise<unknown>) {
    const read = repository.findById.bind(repository);
    jest.spyOn(repository, 'findById').mockImplementationOnce(async (id: string) => {
      const snapshot = await read(id);
      await meanwhile();
      return snapshot;
    });
    return stale();
  }

  const refuse = () =>
    service.decideReturn(returnId, operatorId, {
      decision: ReturnDecision.REJECT,
      reason: 'Пошкоджено покупцем',
    });

  const switchToReplacement = () =>
    service.decideReturn(returnId, operatorId, {
      decision: ReturnDecision.REPLACEMENT,
      reason: 'Покупець погодився на заміну',
    });

  const markReceived = (restock = false) =>
    service.resolveReturn(returnId, {
      status: ReturnStatus.RECEIVED,
      operatorNotes: 'Посилка на складі',
      ...(restock ? { restock: true } : {}),
    });

  const markRefunded = () =>
    service.resolveReturn(returnId, { status: ReturnStatus.REFUNDED, refundedAmount: '100.00' });

  /** The 409 every loser of a transition race gets. */
  function expectStaleTransition(caught: unknown) {
    expect(caught).toBeInstanceOf(HttpException);
    expect((caught as HttpException).getStatus()).toBe(409);
    expect((caught as HttpException).getResponse()).toMatchObject({
      error: 'RETURN_TRANSITION_INVALID',
    });
  }

  const stock = async () =>
    (await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stock;

  it('refuses "received" that lost the race to a refusal — 409, the refusal stands', async () => {
    await seedReturn(ReturnStatus.APPROVED);

    const caught = await interleave(() => markReceived(), refuse).catch((e: unknown) => e);

    expectStaleTransition(caught);
    const row = await prisma.return.findUniqueOrThrow({ where: { id: returnId } });
    expect(row).toMatchObject({
      status: ReturnStatus.REJECTED,
      decision: ReturnDecision.REJECT,
      operatorNotes: null,
    });
  });

  it('refuses "received + restock" that lost the race to a refusal — 409, no stock credited', async () => {
    await seedReturn(ReturnStatus.APPROVED);

    const caught = await interleave(() => markReceived(true), refuse).catch((e: unknown) => e);

    expectStaleTransition(caught);
    const row = await prisma.return.findUniqueOrThrow({ where: { id: returnId } });
    expect(row).toMatchObject({
      status: ReturnStatus.REJECTED,
      decision: ReturnDecision.REJECT,
      restockedAt: null,
    });
    expect(await stock()).toBe(PRODUCT_STOCK);
  });

  it('refuses a refund that lost the race to a switch to replacement — 409, no money recorded', async () => {
    await seedReturn(ReturnStatus.RECEIVED);

    const caught = await interleave(markRefunded, switchToReplacement).catch((e: unknown) => e);

    expectStaleTransition(caught);
    const row = await prisma.return.findUniqueOrThrow({ where: { id: returnId } });
    expect(row.status).toBe(ReturnStatus.RECEIVED);
    expect(row.decision).toBe(ReturnDecision.REPLACEMENT);
    expect(row.refundedAmount).toBeNull();
  });

  it('lets only the first of two stale "received" clicks through', async () => {
    await seedReturn(ReturnStatus.APPROVED);

    const caught = await interleave(
      () => markReceived(),
      () => markReceived(),
    ).catch((e: unknown) => e);

    expectStaleTransition(caught);
    const row = await prisma.return.findUniqueOrThrow({ where: { id: returnId } });
    expect(row.status).toBe(ReturnStatus.RECEIVED);
  });

  it('lets exactly one of a concurrent "received" and a refusal win, leaving a consistent row', async () => {
    await seedReturn(ReturnStatus.APPROVED);

    const results = await Promise.allSettled([markReceived(), refuse()]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expectStaleTransition(rejected[0].reason);

    const row = await prisma.return.findUniqueOrThrow({ where: { id: returnId } });
    expect([
      `${ReturnStatus.RECEIVED}/${ReturnDecision.REFUND}`,
      `${ReturnStatus.REJECTED}/${ReturnDecision.REJECT}`,
    ]).toContain(`${row.status}/${row.decision}`);
  });
});
