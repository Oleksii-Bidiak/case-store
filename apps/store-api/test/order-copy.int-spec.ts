import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  DeliveryMethod,
  MoneyDirection,
  MoneyEntryKind,
  OrderHistoryNote,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { CacheService } from '../src/cache';
import { OrderMoneyRepository } from '../src/order/order-money.repository';
import { OrderRepository } from '../src/order/order.repository';
import { OrderEntity } from '../src/order/entities';
import { PrismaService } from '../src/prisma';
import { ProductIndexer } from '../src/search/product-indexer';

/**
 * «Створити копію» with «Скасувати #старе» (TASK-2048) against a REAL Postgres:
 * the cancel, the copy and the «Залік» are one transaction.
 *
 * - The LAST unit on the shelf moves from the original to its copy — only
 *   because the original's stock is released before the copy reserves.
 * - Any failure of the copy rolls the cancel back: the original stays live,
 *   holding its stock, with no new history or money rows.
 * - Money the original holds moves as an OUT/IN pair, capped by the copy's
 *   total; the rest stays on the original as «Винні покупцю».
 *
 * Requires an isolated `*_test` database (setup-int.ts forces DATABASE_URL).
 */
describe('OrderRepository.createManualCopy (integration, TASK-2048)', () => {
  let prisma: PrismaService;
  let orders: OrderRepository;
  let money: OrderMoneyRepository;

  let userId = '';
  let categoryId = '';
  let productId = '';
  let otherProductId = '';

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [
        PrismaService,
        OrderMoneyRepository,
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
    orders = moduleRef.get(OrderRepository);
    money = moduleRef.get(OrderMoneyRepository);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    const suffix = randomUUID().slice(0, 8);
    const category = await prisma.category.create({
      data: { name: `copy-cat-${suffix}`, slug: `copy-cat-${suffix}` },
    });
    categoryId = category.id;
    // The last unit: one on the shelf before the original reserved it.
    productId = (
      await prisma.product.create({
        data: { name: `copy-${suffix}`, slug: `copy-${suffix}`, price: 1000, stock: 1, categoryId },
      })
    ).id;
    otherProductId = (
      await prisma.product.create({
        data: {
          name: `copy-other-${suffix}`,
          slug: `copy-other-${suffix}`,
          price: 300,
          stock: 0,
          categoryId,
        },
      })
    ).id;
    userId = (
      await prisma.user.create({ data: { email: `copy-${suffix}@test.local`, passwordHash: 'x' } })
    ).id;
  });

  afterEach(async () => {
    if (!prisma) return;
    if (userId) {
      const mine = { order: { userId } };
      await prisma.orderMoneyEntry.deleteMany({ where: mine });
      await prisma.orderStatusHistory.deleteMany({ where: mine });
      await prisma.orderItem.deleteMany({ where: mine });
      // Copies first: `copiedFromId` is Restrict.
      await prisma.order.deleteMany({ where: { userId, copiedFromId: { not: null } } });
      await prisma.order.deleteMany({ where: { userId } });
    }
    for (const id of [productId, otherProductId]) {
      if (id) await prisma.product.deleteMany({ where: { id } });
    }
    if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    userId = productId = otherProductId = categoryId = '';
  });

  /** A 1 000 ₴ PROCESSING order holding the last unit, `paidKop` received. */
  async function placeOriginal(paidKop = 0, status: OrderStatus = OrderStatus.PROCESSING) {
    const order = await prisma.order.create({
      data: {
        userId,
        status,
        paymentStatus: PaymentStatus.PENDING,
        paymentMethod: PaymentMethod.ON_DELIVERY,
        deliveryMethod: DeliveryMethod.OTHER,
        subtotal: 1000,
        total: 1000,
        balanceKop: 100_000,
        shippingAddress: { firstName: 'Олена', lastName: 'Коваль', city: 'Київ', address1: '1' },
        items: { create: [{ productId, quantity: 1, price: 1000 }] },
      },
    });
    await prisma.product.update({ where: { id: productId }, data: { stock: { decrement: 1 } } });
    if (paidKop > 0) {
      await prisma.orderMoneyEntry.create({
        data: {
          orderId: order.id,
          direction: MoneyDirection.IN,
          kind: MoneyEntryKind.BANK_TRANSFER,
          amountKop: paidKop,
          occurredAt: new Date(),
        },
      });
      await money.transaction(order.id, (tx) => money.recompute(tx, order.id, null));
    }
    return order.id;
  }

  const copyParams = (lines: Array<{ productId: string; price: string }>) => ({
    userId,
    items: lines.map((line) => ({ ...line, quantity: 1, name: 'copy line' })),
    shippingAddress: {
      firstName: 'Олена',
      lastName: 'Коваль',
      phone: '+380501234567',
      city: 'Київ',
      address1: '1',
    } as never,
    deliveryMethod: DeliveryMethod.OTHER,
  });

  const stockOf = async (id: string) =>
    (await prisma.product.findUniqueOrThrow({ where: { id } })).stock;

  it('moves the last unit to the copy only together with the cancel', async () => {
    const originalId = await placeOriginal();
    expect(await stockOf(productId)).toBe(0);

    // Without the cancel there is nothing on the shelf for the copy.
    await expect(
      orders.createManualCopy(
        copyParams([{ productId, price: '1000.00' }]),
        { sourceOrderId: originalId, cancelOriginal: false },
        userId,
      ),
    ).rejects.toThrow(ConflictException);

    const { order: copy } = await orders.createManualCopy(
      copyParams([{ productId, price: '1000.00' }]),
      { sourceOrderId: originalId, cancelOriginal: true },
      userId,
    );

    expect(await stockOf(productId)).toBe(0);
    const original = await prisma.order.findUniqueOrThrow({ where: { id: originalId } });
    expect(original.status).toBe(OrderStatus.CANCELLED);
    expect(original.restockedAt).not.toBeNull();
    const stored = await prisma.order.findUniqueOrThrow({ where: { id: copy.id } });
    expect(stored.copiedFromId).toBe(originalId);
    expect(stored.status).toBe(OrderStatus.PENDING);

    const notes = await prisma.orderStatusHistory.findMany({
      where: { orderId: { in: [originalId, copy.id] }, note: { not: null } },
      select: { orderId: true, note: true },
    });
    expect(notes).toEqual(
      expect.arrayContaining([
        { orderId: originalId, note: OrderHistoryNote.COPIED_TO_ORDER },
        { orderId: copy.id, note: OrderHistoryNote.COPY_OF_ORDER },
      ]),
    );
  });

  it('rolls the cancel back when the copy cannot be created — the original stays intact', async () => {
    const originalId = await placeOriginal(40_000);
    const historyBefore = await prisma.orderStatusHistory.count({ where: { orderId: originalId } });

    // The second line has no stock at all: the copy's reservation fails.
    await expect(
      orders.createManualCopy(
        copyParams([
          { productId, price: '1000.00' },
          { productId: otherProductId, price: '300.00' },
        ]),
        { sourceOrderId: originalId, cancelOriginal: true },
        userId,
      ),
    ).rejects.toThrow(ConflictException);

    const original = await prisma.order.findUniqueOrThrow({ where: { id: originalId } });
    expect(original.status).toBe(OrderStatus.PROCESSING);
    expect(original.restockedAt).toBeNull();
    expect(original.paidKop).toBe(40_000);
    expect(await stockOf(productId)).toBe(0);
    expect(await prisma.orderStatusHistory.count({ where: { orderId: originalId } })).toBe(
      historyBefore,
    );
    expect(await prisma.orderMoneyEntry.count({ where: { orderId: originalId } })).toBe(1);
    expect(await prisma.order.count({ where: { copiedFromId: originalId } })).toBe(0);
  });

  it('moves the paid money as a «Залік» pair, capped by the copy total', async () => {
    // 1 000 ₴ paid; the copy is the cheaper 300 ₴ line → 300 ₴ moves, 700 ₴ owed back.
    await prisma.product.update({ where: { id: otherProductId }, data: { stock: 1 } });
    const originalId = await placeOriginal(100_000);

    const { order: copy, offsetKop } = await orders.createManualCopy(
      copyParams([{ productId: otherProductId, price: '300.00' }]),
      { sourceOrderId: originalId, cancelOriginal: true },
      userId,
    );

    expect(offsetKop).toBe(30_000);
    const pair = await prisma.orderMoneyEntry.findMany({
      where: { kind: { in: [MoneyEntryKind.OFFSET_TO_ORDER, MoneyEntryKind.OFFSET_FROM_ORDER] } },
      select: { orderId: true, direction: true, amountKop: true, counterpartOrderId: true },
      orderBy: { direction: 'asc' },
    });
    expect(pair.filter((row) => [originalId, copy.id].includes(row.orderId))).toEqual([
      {
        orderId: copy.id,
        direction: MoneyDirection.IN,
        amountKop: 30_000,
        counterpartOrderId: originalId,
      },
      {
        orderId: originalId,
        direction: MoneyDirection.OUT,
        amountKop: 30_000,
        counterpartOrderId: copy.id,
      },
    ]);

    const original = await prisma.order.findUniqueOrThrow({ where: { id: originalId } });
    expect(original).toMatchObject({
      paidKop: 100_000,
      refundedKop: 30_000,
      // The 300 ₴ went on to the copy, not back to the customer.
      offsetOutKop: 30_000,
      balanceKop: -70_000,
    });
    const stored = await prisma.order.findUniqueOrThrow({ where: { id: copy.id } });
    expect(stored).toMatchObject({
      paidKop: 30_000,
      balanceKop: 0,
      paymentStatus: PaymentStatus.PAID,
    });
  });

  it('refuses to cancel an original that has shipped meanwhile, writing nothing', async () => {
    const originalId = await placeOriginal(0, OrderStatus.SHIPPED);

    await expect(
      orders.createManualCopy(
        copyParams([{ productId, price: '1000.00' }]),
        { sourceOrderId: originalId, cancelOriginal: true },
        userId,
      ),
    ).rejects.toMatchObject({ response: { error: 'ORDER_COPY_ORIGINAL_NOT_CANCELLABLE' } });

    expect((await prisma.order.findUniqueOrThrow({ where: { id: originalId } })).status).toBe(
      OrderStatus.SHIPPED,
    );
    expect(await prisma.order.count({ where: { copiedFromId: originalId } })).toBe(0);
  });

  // Verifier findings on TASK-2048.
  it('refuses an original deleted before the lock — nothing written', async () => {
    const originalId = await placeOriginal();
    await prisma.order.update({ where: { id: originalId }, data: { deletedAt: new Date() } });

    await expect(
      orders.createManualCopy(
        copyParams([{ productId, price: '1000.00' }]),
        { sourceOrderId: originalId, cancelOriginal: true },
        userId,
      ),
    ).rejects.toThrow(NotFoundException);

    const original = await prisma.order.findUniqueOrThrow({ where: { id: originalId } });
    expect(original.status).toBe(OrderStatus.PROCESSING);
    expect(original.restockedAt).toBeNull();
    expect(await prisma.order.count({ where: { copiedFromId: originalId } })).toBe(0);
  });

  it('rolls everything back when the in-transaction hook fails', async () => {
    const originalId = await placeOriginal();

    await expect(
      orders.createManualCopy(
        copyParams([{ productId, price: '1000.00' }]),
        { sourceOrderId: originalId, cancelOriginal: true },
        userId,
        async () => {
          throw new Error('outbox down');
        },
      ),
    ).rejects.toThrow('outbox down');

    const original = await prisma.order.findUniqueOrThrow({ where: { id: originalId } });
    expect(original.status).toBe(OrderStatus.PROCESSING);
    expect(await stockOf(productId)).toBe(0);
    expect(await prisma.order.count({ where: { copiedFromId: originalId } })).toBe(0);
  });

  it('moves the money off an original cancelled long ago, but did not replace it', async () => {
    const originalId = await placeOriginal(20_000, OrderStatus.CANCELLED);
    // Its stock came back with that old cancel.
    await prisma.product.update({ where: { id: productId }, data: { stock: 1 } });
    const hook = jest.fn().mockResolvedValue(undefined);

    const { replaced, offsetKop } = await orders.createManualCopy(
      copyParams([{ productId, price: '1000.00' }]),
      { sourceOrderId: originalId, cancelOriginal: false },
      userId,
      hook,
    );

    expect(replaced).toBe(false);
    expect(offsetKop).toBe(20_000);
    expect(hook).toHaveBeenCalledWith(expect.anything(), expect.anything(), { replaced: false });
    // The card: a plain copy, not «Замінено на».
    const card = OrderEntity.fromPrisma((await orders.findByIdForAdmin(originalId))!);
    expect(card.copyIds).toHaveLength(1);
    expect(card.replacedById).toBeNull();
  });

  it('names the replacing copy on the original’s card, not an earlier or later one', async () => {
    await prisma.product.update({ where: { id: productId }, data: { stock: 3 } });
    const originalId = await placeOriginal();
    const line = copyParams([{ productId, price: '1000.00' }]);
    const before = await orders.createManualCopy(
      line,
      { sourceOrderId: originalId, cancelOriginal: false },
      userId,
    );
    const replacer = await orders.createManualCopy(
      line,
      { sourceOrderId: originalId, cancelOriginal: true },
      userId,
    );
    const later = await orders.createManualCopy(
      line,
      { sourceOrderId: originalId, cancelOriginal: false },
      userId,
    );

    const card = OrderEntity.fromPrisma((await orders.findByIdForAdmin(originalId))!);
    expect(card.copyIds).toEqual([before.order.id, replacer.order.id, later.order.id]);
    expect(card.replacedById).toBe(replacer.order.id);
  });
});
