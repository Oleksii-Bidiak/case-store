import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { DeliveryMethod, MoneyEntryKind, PaymentMethod, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { CacheService } from '../src/cache';
import { DashboardRepository } from '../src/dashboard/dashboard.repository';
import { ProductsReportRepository } from '../src/analytics/reports/products-report.repository';
import { SalesRepository } from '../src/analytics/reports/sales.repository';
import { OrderMoneyRepository } from '../src/order/order-money.repository';
import { OrderRepository } from '../src/order/order.repository';
import type { AddressDto } from '../src/order/dto';
import type { CreateOrderParams } from '../src/order/order.types';
import { PrismaService } from '../src/prisma';
import { ProductIndexer } from '../src/search/product-indexer';

/**
 * A new order opens owing its total (R2 review, finding 1) — against a REAL
 * Postgres.
 *
 * `balance_kop` defaults to 0, and before this fix nothing derived it when an
 * order was created: every fresh unpaid order was invisible to «unpaid in
 * transit», «Борг», the dashboard's unrealized revenue and the money card until
 * some later recompute touched it. Both creation paths now write the balance
 * the ledger rule (`deriveBalance`) gives an order with no money yet.
 *
 * Requires an isolated `*_test` database (setup-int.ts forces DATABASE_URL).
 */
describe('A new order opens owing its total (integration, R2 review)', () => {
  let prisma: PrismaService;
  let orders: OrderRepository;
  let money: OrderMoneyRepository;
  let dashboard: DashboardRepository;

  const tag = randomUUID().slice(0, 8);
  let categoryId = '';
  let productId = '';
  let userId = '';
  const orderIds: string[] = [];

  const UNIT_PRICE = '149.50';
  const SHIPPING = 85;
  /** 2 × 149.50 + 85 shipping. */
  const TOTAL_KOP = 38_400;

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
        DashboardRepository,
        ProductsReportRepository,
        SalesRepository,
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
    dashboard = moduleRef.get(DashboardRepository);
    await prisma.$connect();

    const category = await prisma.category.create({
      data: { name: `open-bal-cat-${tag}`, slug: `open-bal-cat-${tag}` },
    });
    categoryId = category.id;
    const product = await prisma.product.create({
      data: {
        name: `open-bal-prod-${tag}`,
        slug: `open-bal-prod-${tag}`,
        price: new Prisma.Decimal(UNIT_PRICE),
        stock: 100,
        categoryId,
      },
    });
    productId = product.id;
    const user = await prisma.user.create({
      data: { email: `open-bal-${tag}@test.local`, passwordHash: 'x' },
    });
    userId = user.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    if (orderIds.length > 0) {
      await prisma.orderMoneyEntry.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    }
    if (userId) await prisma.cart.deleteMany({ where: { userId } });
    if (productId) await prisma.product.deleteMany({ where: { id: productId } });
    if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  const address = {
    firstName: 'Тарас',
    lastName: 'Шевченко',
    address1: 'Нова Пошта, відділення №12',
    city: 'Київ',
    phone: '+380501234567',
  } as AddressDto;

  async function manualCodOrder(): Promise<string> {
    const created = await orders.createManual(
      {
        guest: {
          email: `open-bal-guest-${randomUUID()}@test.local`,
          phone: '+380501234567',
          name: 'Гість',
        },
        items: [{ productId, quantity: 2, price: UNIT_PRICE, name: 'open-bal' }],
        shippingAddress: address,
        shippingCost: SHIPPING,
        paymentMethod: PaymentMethod.ON_DELIVERY,
        deliveryMethod: DeliveryMethod.NOVA_POSHTA,
      },
      null,
    );
    orderIds.push(created.id);
    return created.id;
  }

  const balanceOf = async (orderId: string) =>
    (await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).balanceKop;

  const unpaidInTransit = async () =>
    (await orders.findAll({ unpaidInTransit: true, limit: 100_000 })).orders.map((o) => o.id);

  const unrealizedKop = async () =>
    Math.round((await dashboard.getRevenueMetrics()).unrealizedRevenue * 100);

  it('a phone (manual) COD order owes its total and is counted as unpaid', async () => {
    const before = await unrealizedKop();

    const orderId = await manualCodOrder();

    expect(await balanceOf(orderId)).toBe(TOTAL_KOP);
    expect(await unpaidInTransit()).toContain(orderId);
    expect((await unrealizedKop()) - before).toBe(TOTAL_KOP);
  });

  it('after a full receipt it owes nothing and leaves the unpaid lists', async () => {
    const orderId = await manualCodOrder();
    const before = await unrealizedKop();

    await money.transaction(orderId, async (tx) => {
      await money.insertEntry(tx, {
        orderId,
        kind: MoneyEntryKind.COD_NOVA_POSHTA,
        amountKop: TOTAL_KOP,
        actorId: null,
      });
      await money.recompute(tx, orderId, null);
    });

    expect(await balanceOf(orderId)).toBe(0);
    expect(await unpaidInTransit()).not.toContain(orderId);
    expect(before - (await unrealizedKop())).toBe(TOTAL_KOP);
  });

  it('a storefront (cart) order owes its total too', async () => {
    const cart = await prisma.cart.create({
      data: { userId, items: { create: [{ productId, quantity: 2 }] } },
      include: { items: { include: { product: true, addons: true } } },
    });

    const created = await orders.createFromCart({
      userId,
      cartId: cart.id,
      cartItems: cart.items as unknown as CreateOrderParams['cartItems'],
      shippingAddress: address,
      shippingCost: SHIPPING,
      paymentMethod: PaymentMethod.ON_DELIVERY,
      deliveryMethod: DeliveryMethod.NOVA_POSHTA,
    });
    orderIds.push(created.id);

    expect(await balanceOf(created.id)).toBe(TOTAL_KOP);
    expect(await unpaidInTransit()).toContain(created.id);
  });
});
