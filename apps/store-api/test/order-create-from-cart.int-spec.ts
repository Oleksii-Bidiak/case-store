import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { DeliveryMethod, PaymentMethod, Prisma } from '@prisma/client';
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
      deliveryMethod: DeliveryMethod.NOVA_POSHTA,
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

  // ─── Delivery method (TASK-643) ──────────────────────────────────────────────

  describe('delivery method (TASK-643)', () => {
    let pickupPointId = '';

    afterEach(async () => {
      // Runs BEFORE the outer afterEach, so the order still exists and its FK
      // is simply set null by the point's deletion (if a test left the point).
      if (pickupPointId) await prisma.pickupPoint.deleteMany({ where: { id: pickupPointId } });
      pickupPointId = '';
    });

    it('persists a COURIER order with its method and shipping cost, keeping the total invariant under a discount', async () => {
      const COURIER_PRICE = 120;
      const DISCOUNT = '20.00';

      const created = await repo.createFromCart(
        await buildParams({
          deliveryMethod: DeliveryMethod.COURIER,
          shippingCost: COURIER_PRICE,
          discount: { amount: DISCOUNT, code: 'INT643', redeem: async () => undefined },
        }),
      );

      const row = await persisted(created.id);
      expect(row.deliveryMethod).toBe(DeliveryMethod.COURIER);
      expect(row.pickupPointId).toBeNull();
      expect(row.shippingCost.toFixed(2)).toBe('120.00');
      expect(row.discount.toFixed(2)).toBe(DISCOUNT);
      // The discount comes off the goods, never off the shipping.
      expect(row.total.toFixed(2)).toBe(
        row.subtotal.plus(row.shippingCost).plus(row.addonsTotal).minus(row.discount).toFixed(2),
      );
      expect(row.total.toFixed(2)).toBe(
        new Prisma.Decimal(UNIT_PRICE)
          .times(ORDERED_QTY)
          .plus(COURIER_PRICE)
          .minus(DISCOUNT)
          .toFixed(2),
      );
    });

    it('persists a PICKUP order linked to its point; deleting the point nulls the link but not the snapshot', async () => {
      const point = await prisma.pickupPoint.create({
        data: { name: 'Int-643 point', city: 'Київ', address: 'вул. Хрещатик, 1' },
      });
      pickupPointId = point.id;

      const created = await repo.createFromCart(
        await buildParams({
          deliveryMethod: DeliveryMethod.PICKUP,
          pickupPointId: point.id,
          shippingCost: 0,
          shippingAddress: {
            firstName: 'Тарас',
            lastName: 'Шевченко',
            phone: '+380501234567',
            city: point.city,
            address1: point.address,
            deliveryMethod: DeliveryMethod.PICKUP,
            carrier: null,
            pickupPointName: point.name,
            pickupPointAddress: point.address,
          },
        }),
      );

      const row = await persisted(created.id);
      expect(row.deliveryMethod).toBe(DeliveryMethod.PICKUP);
      expect(row.pickupPointId).toBe(point.id);
      expect(row.shippingCost.toFixed(2)).toBe('0.00');

      await prisma.pickupPoint.delete({ where: { id: point.id } });
      pickupPointId = '';

      const after = await persisted(created.id);
      // onDelete: SetNull — the order survives its point…
      expect(after.pickupPointId).toBeNull();
      // …and still says where the parcel was to be collected.
      expect(after.shippingAddress).toMatchObject({
        deliveryMethod: 'PICKUP',
        pickupPointName: 'Int-643 point',
        pickupPointAddress: 'вул. Хрещатик, 1',
      });
    });
  });

  // ─── Billing address (TASK-1022) ─────────────────────────────────────────────

  describe('billing address when the buyer sent none (TASK-1022)', () => {
    /** A shipping snapshot carrying every delivery-only field there is. */
    const snapshot = {
      firstName: 'Тарас',
      lastName: 'Шевченко',
      company: 'ФОП Шевченко',
      phone: '+380501234567',
      address1: 'Нова Пошта, відділення №12',
      address2: 'під’їзд 2',
      city: 'Київ',
      state: 'Київська',
      postalCode: '01001',
      country: 'UA',
      npCityRef: 'city-ref-1',
      npWarehouseRef: 'wh-ref-1',
      npWarehouseName: 'Відділення №12',
      deliveryMethod: DeliveryMethod.PICKUP,
      carrier: null,
      shippingCostPending: true,
      pickupPointName: 'Точка',
      pickupPointAddress: 'вул. Хрещатик, 1',
      pickupPointHours: 'Пн–Пт 10–19',
      pickupPointPhone: '+380441234567',
      pickupPointMapUrl: 'https://maps.example/x',
    } as CreateOrderParams['shippingAddress'];

    // NULL means "same as shipping", the contract both order views render by.
    // Any copy of the snapshot (whole or address fields only) made them show a
    // redundant «Платіжна адреса» block.
    it('stores SQL NULL — no copy of the delivery snapshot, no redundant billing block', async () => {
      const created = await repo.createFromCart(await buildParams({ shippingAddress: snapshot }));

      const row = await persisted(created.id);
      expect(row.billingAddress).toBeNull();
      // A real SQL NULL, not the JSON literal `null` (which `?? null` would hide).
      const [raw] = await prisma.$queryRaw<{ isNull: boolean }[]>`
        SELECT billing_address IS NULL AS "isNull" FROM orders WHERE id = ${created.id}`;
      expect(raw.isNull).toBe(true);
      // The shipping snapshot itself is untouched.
      expect(row.shippingAddress).toEqual(snapshot);
    });

    it('stores an explicit billing address as sent', async () => {
      const billing = {
        firstName: 'Олена',
        lastName: 'Коваль',
        phone: '+380671112233',
        address1: 'вул. Городоцька, 5',
        city: 'Львів',
        country: 'UA',
      };

      const created = await repo.createFromCart(
        await buildParams({ shippingAddress: snapshot, billingAddress: billing }),
      );

      expect((await persisted(created.id)).billingAddress).toEqual(billing);
    });
  });
});
