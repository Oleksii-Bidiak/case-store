import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  DeliveryMethod,
  MoneyEntryKind,
  PaymentMethod,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { CacheService } from '../src/cache';
import { OrderMoneyRepository } from '../src/order/order-money.repository';
import { OrderRepository } from '../src/order/order.repository';
import type { AddressDto } from '../src/order/dto';
import { PrismaService } from '../src/prisma';
import { ProductIndexer } from '../src/search/product-indexer';

/**
 * The operator quotes an «Інша доставка» order afterwards (AD-ORD-86,
 * TASK-1019) — against a REAL Postgres.
 *
 * `balance_kop` is written only by `OrderMoneyRepository.recompute`, so a new
 * shipping cost must move `shipping_cost`, `total` and the balance in ONE
 * transaction under the order lock. These tests pin what the money card reads
 * afterwards: the new total, and what is still owed — including on an order
 * whose goods were already paid in full.
 *
 * Requires an isolated `*_test` database (setup-int.ts forces DATABASE_URL).
 */
describe('Agreed OTHER shipping cost on an existing order (integration, AD-ORD-86)', () => {
  let prisma: PrismaService;
  let orders: OrderRepository;
  let money: OrderMoneyRepository;

  const tag = randomUUID().slice(0, 8);
  let categoryId = '';
  let productId = '';
  let adminId = '';
  const orderIds: string[] = [];

  const UNIT_PRICE = '149.50';
  /** 2 × 149.50. */
  const GOODS_KOP = 29_900;

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

    const category = await prisma.category.create({
      data: { name: `ship-cost-cat-${tag}`, slug: `ship-cost-cat-${tag}` },
    });
    categoryId = category.id;
    const product = await prisma.product.create({
      data: {
        name: `ship-cost-prod-${tag}`,
        slug: `ship-cost-prod-${tag}`,
        price: new Prisma.Decimal(UNIT_PRICE),
        stock: 100,
        categoryId,
      },
    });
    productId = product.id;
    const admin = await prisma.user.create({
      data: { email: `ship-cost-admin-${tag}@test.local`, passwordHash: 'x' },
    });
    adminId = admin.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    if (orderIds.length > 0) {
      await prisma.orderMoneyEntry.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    }
    if (productId) await prisma.product.deleteMany({ where: { id: productId } });
    if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } });
    if (adminId) await prisma.user.deleteMany({ where: { id: adminId } });
    await prisma.$disconnect();
  });

  const address = {
    firstName: 'Тарас',
    lastName: 'Шевченко',
    address1: 'вул. Січових Стрільців, 3',
    city: 'Житомир',
    phone: '+380501234567',
    deliveryMethod: DeliveryMethod.OTHER,
    carrier: null,
    shippingCostPending: true,
  } as unknown as AddressDto;

  /** An OTHER phone order booked «to be quoted»: 0 shipping. */
  async function otherOrder(paymentMethod: PaymentMethod): Promise<string> {
    const created = await orders.createManual(
      {
        guest: {
          email: `ship-cost-guest-${randomUUID()}@test.local`,
          phone: '+380501234567',
          name: 'Гість',
        },
        items: [{ productId, quantity: 2, price: UNIT_PRICE, name: 'ship-cost' }],
        shippingAddress: address,
        shippingCost: 0,
        paymentMethod,
        deliveryMethod: DeliveryMethod.OTHER,
      },
      null,
    );
    orderIds.push(created.id);
    return created.id;
  }

  const read = (orderId: string) => prisma.order.findUniqueOrThrow({ where: { id: orderId } });

  it('adds the agreed cost to the total and to what the buyer owes', async () => {
    const orderId = await otherOrder(PaymentMethod.ON_DELIVERY);
    const { updatedAt } = await read(orderId);
    const quoted = { ...address, shippingCostPending: undefined };

    await orders.updateDetails(
      orderId,
      { shippingAddress: quoted, shippingCost: 150 },
      { expectedUpdatedAt: updatedAt, changedBy: adminId },
    );

    const order = await read(orderId);
    expect(order.shippingCost.toString()).toBe('150');
    expect(order.total.toString()).toBe('449');
    expect(order.balanceKop).toBe(GOODS_KOP + 15_000);
    expect(order.shippingAddress).not.toHaveProperty('shippingCostPending');
  });

  it('turns an order whose goods were paid in full into one that owes the delivery', async () => {
    const orderId = await otherOrder(PaymentMethod.BANK_TRANSFER);
    await money.transaction(orderId, async (tx) => {
      await money.insertEntry(tx, {
        orderId,
        kind: MoneyEntryKind.BANK_TRANSFER,
        amountKop: GOODS_KOP,
        actorId: null,
      });
      await money.recompute(tx, orderId, null);
    });
    expect((await read(orderId)).paymentStatus).toBe(PaymentStatus.PAID);

    await orders.updateDetails(orderId, { shippingCost: 120.5 }, { changedBy: adminId });

    const order = await read(orderId);
    expect(order.total.toString()).toBe('419.5');
    expect(order.balanceKop).toBe(12_050);
    expect(order.paymentStatus).not.toBe(PaymentStatus.PAID);
  });

  it('re-quoting replaces the old cost rather than adding to it', async () => {
    const orderId = await otherOrder(PaymentMethod.ON_DELIVERY);

    await orders.updateDetails(orderId, { shippingCost: 150 }, {});
    await orders.updateDetails(orderId, { shippingCost: 90 }, {});

    const order = await read(orderId);
    expect(order.shippingCost.toString()).toBe('90');
    expect(order.total.toString()).toBe('389');
    expect(order.balanceKop).toBe(GOODS_KOP + 9_000);
  });

  it('refuses to re-price under a live LiqPay link, and lets it through once the link is gone (review R3)', async () => {
    const orderId = await otherOrder(PaymentMethod.ON_DELIVERY);
    const attempt = await prisma.payment.create({
      data: { orderId, provider: 'liqpay', amount: 299, status: 'PENDING' },
    });

    await expect(
      orders.updateDetails(orderId, { shippingCost: 150 }, { changedBy: adminId }),
    ).rejects.toMatchObject({ response: { error: 'ORDER_PAYMENT_IN_PROGRESS' } });
    expect((await read(orderId)).total.toString()).toBe('299');

    await prisma.payment.update({ where: { id: attempt.id }, data: { status: 'EXPIRED' } });
    await orders.updateDetails(orderId, { shippingCost: 150 }, { changedBy: adminId });

    expect((await read(orderId)).total.toString()).toBe('449');
    await prisma.payment.deleteMany({ where: { orderId } });
  });

  it('refuses a stale version and leaves the money untouched', async () => {
    const orderId = await otherOrder(PaymentMethod.ON_DELIVERY);

    await expect(
      orders.updateDetails(
        orderId,
        { shippingCost: 150 },
        { expectedUpdatedAt: new Date('2000-01-01T00:00:00Z') },
      ),
    ).rejects.toMatchObject({ response: { error: 'ORDER_STALE' } });

    const order = await read(orderId);
    expect(order.total.toString()).toBe('299');
    expect(order.balanceKop).toBe(GOODS_KOP);
  });
});
