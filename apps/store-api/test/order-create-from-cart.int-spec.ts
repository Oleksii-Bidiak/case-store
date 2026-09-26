import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PaymentMethod, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { OrderRepository } from '../src/order/order.repository';
import type { CreateOrderParams } from '../src/order/order.types';
import { CacheService } from '../src/cache';
import { PrismaService } from '../src/prisma';
import { ProductIndexer } from '../src/search/product-indexer';

/**
 * OrderRepository.createFromCart against a REAL Postgres (TASK-1018).
 *
 * `OrderService.createOrder` hands the repository the shopper's payment method
 * and — for ONLINE/INSTALLMENTS — the 30-minute reservation deadline (TASK-330).
 * Every unit and e2e spec mocks OrderRepository, so none of them could see that
 * `createFromCart` dropped both on the floor: every storefront order was stored
 * as ON_DELIVERY with a null deadline, and `findExpiredReservations` (which
 * requires an ONLINE/INSTALLMENTS method AND a non-null deadline) never matched
 * an abandoned card order. Only reading the persisted row back shows it.
 *
 * Requires an isolated `*_test` database (setup-int.ts forces DATABASE_URL).
 */
describe('OrderRepository.createFromCart — persisted row (integration)', () => {
  let prisma: PrismaService;
  let repo: OrderRepository;

  let userId = '';
  let categoryId = '';
  let productId = '';
  let cartId = '';

  const INITIAL_STOCK = 10;
  const ORDERED_QTY = 2;
  const UNIT_PRICE = '149.50';
  const SHIPPING_COST = 85;
  /** The deadline the service computes for a card order (TASK-330). */
  const in30Minutes = () => new Date(Date.now() + 30 * 60_000);

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
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    const suffix = randomUUID().slice(0, 8);
    const category = await prisma.category.create({
      data: { name: `cfc-cat-${suffix}`, slug: `cfc-cat-${suffix}` },
    });
    categoryId = category.id;
    const product = await prisma.product.create({
      data: {
        name: `cfc-prod-${suffix}`,
        slug: `cfc-prod-${suffix}`,
        price: new Prisma.Decimal(UNIT_PRICE),
        stock: INITIAL_STOCK,
        categoryId,
      },
    });
    productId = product.id;
    const user = await prisma.user.create({
      data: { email: `create-from-cart-${suffix}@test.local`, passwordHash: 'x' },
    });
    userId = user.id;
    const cart = await prisma.cart.create({
      data: { userId, items: { create: [{ productId, quantity: ORDERED_QTY }] } },
    });
    cartId = cart.id;
  });

  afterEach(async () => {
    // Scoped to THIS test's rows — never an unset id (Prisma drops `undefined`).
    if (!prisma) return;
    if (userId) {
      await prisma.orderStatusHistory.deleteMany({ where: { order: { userId } } });
      await prisma.orderItem.deleteMany({ where: { order: { userId } } });
      await prisma.order.deleteMany({ where: { userId } });
    }
    if (cartId) await prisma.cart.deleteMany({ where: { id: cartId } });
    if (productId) await prisma.product.deleteMany({ where: { id: productId } });
    if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    userId = productId = categoryId = cartId = '';
  });

  /**
   * Valid CreateOrderParams for this test's cart, as OrderService would build
   * them. The cart lines are read from the database (the repository only uses
   * each line's id, productId, quantity and product name/price). Override any
   * field per case — e.g. deliveryMethod / pickupPointId once they exist.
   */
  async function buildParams(
    overrides: Partial<CreateOrderParams> = {},
  ): Promise<CreateOrderParams> {
    const cart = await prisma.cart.findUniqueOrThrow({
      where: { id: cartId },
      include: { items: { include: { product: true, addons: true } } },
    });
    return {
      userId,
      cartId,
      cartItems: cart.items as unknown as CreateOrderParams['cartItems'],
      shippingAddress: {
        firstName: 'Тарас',
        lastName: 'Шевченко',
        address1: 'Нова Пошта, відділення №12',
        city: 'Київ',
        phone: '+380501234567',
      } as CreateOrderParams['shippingAddress'],
      shippingCost: SHIPPING_COST,
      ...overrides,
    };
  }

  const persisted = (orderId: string) => prisma.order.findUniqueOrThrow({ where: { id: orderId } });

  // ─── Payment method + reservation deadline (TASK-1018) ──────────────────────

  it('persists an ONLINE order with its reservation deadline', async () => {
    const deadline = in30Minutes();

    const created = await repo.createFromCart(
      await buildParams({ paymentMethod: PaymentMethod.ONLINE, reservationExpiresAt: deadline }),
    );

    const row = await persisted(created.id);
    expect(row.paymentMethod).toBe(PaymentMethod.ONLINE);
    expect(row.reservationExpiresAt).toEqual(deadline);
  });

  it('persists an INSTALLMENTS order with its reservation deadline', async () => {
    const deadline = in30Minutes();

    const created = await repo.createFromCart(
      await buildParams({
        paymentMethod: PaymentMethod.INSTALLMENTS,
        reservationExpiresAt: deadline,
      }),
    );

    const row = await persisted(created.id);
    expect(row.paymentMethod).toBe(PaymentMethod.INSTALLMENTS);
    expect(row.reservationExpiresAt).toEqual(deadline);
  });

  it('persists an ON_DELIVERY order with no reservation deadline', async () => {
    const created = await repo.createFromCart(
      await buildParams({ paymentMethod: PaymentMethod.ON_DELIVERY, reservationExpiresAt: null }),
    );

    const row = await persisted(created.id);
    expect(row.paymentMethod).toBe(PaymentMethod.ON_DELIVERY);
    expect(row.reservationExpiresAt).toBeNull();
  });

  // ─── Money invariant ─────────────────────────────────────────────────────────

  it('keeps total = subtotal + shippingCost + addonsTotal − discount with non-zero shipping', async () => {
    const created = await repo.createFromCart(
      await buildParams({
        paymentMethod: PaymentMethod.ONLINE,
        reservationExpiresAt: in30Minutes(),
      }),
    );

    const row = await persisted(created.id);
    expect(row.subtotal.toFixed(2)).toBe(
      new Prisma.Decimal(UNIT_PRICE).times(ORDERED_QTY).toFixed(2),
    );
    expect(row.shippingCost.toFixed(2)).toBe(new Prisma.Decimal(SHIPPING_COST).toFixed(2));
    expect(row.total.toFixed(2)).toBe(
      row.subtotal.plus(row.shippingCost).plus(row.addonsTotal).minus(row.discount).toFixed(2),
    );
    // The reservation itself was taken.
    const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(product.stock).toBe(INITIAL_STOCK - ORDERED_QTY);
  });
});
