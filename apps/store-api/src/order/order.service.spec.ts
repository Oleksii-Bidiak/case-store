import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import { OrderRepository } from './order.repository';
import { OrderService } from './order.service';
import { OrderEntity } from './entities';
import { CartRepository, CartWithItems } from '../cart/cart.repository';
import { UserRepository } from '../user/user.repository';
import { MailOutboxService } from '../mail-outbox';
import { DeliveryService } from '../delivery';
import { DiscountService } from '../discount';
import type { User } from '@prisma/client';
import type { OrderWithItems } from './order.types';
import type { CreateOrderDto } from './dto';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = 'user-uuid-1';
const OTHER_USER_ID = 'user-uuid-2';
const now = new Date('2026-06-11T12:00:00.000Z');

const address: CreateOrderDto['shippingAddress'] = {
  firstName: 'Olena',
  lastName: 'Shevchenko',
  phone: '+380501234567',
  address1: 'Нова Пошта, відділення №12',
  city: 'Kyiv',
  country: 'UA',
};

const createDto: CreateOrderDto = { shippingAddress: address };

// ─── Cart mock data ───────────────────────────────────────────────────────────

const cartWithItems: CartWithItems = {
  id: 'cart-uuid-1',
  userId: USER_ID,
  token: null,
  createdAt: now,
  updatedAt: now,
  items: [
    {
      id: 'cart-item-1',
      productId: 'product-uuid-1',
      quantity: 2,
      createdAt: now,
      updatedAt: now,
      product: {
        id: 'product-uuid-1',
        name: 'iPhone 15 Pro Case',
        price: { toString: () => '29.99' } as never,
        compareAtPrice: null,
        stock: 50,
        isActive: true,
        slug: 'test-product',
        images: [],
      },
    },
    {
      id: 'cart-item-2',
      productId: 'product-uuid-2',
      quantity: 1,
      createdAt: now,
      updatedAt: now,
      product: {
        id: 'product-uuid-2',
        name: 'Screen Protector',
        price: { toString: () => '9.99' } as never,
        compareAtPrice: null,
        stock: 30,
        isActive: true,
        slug: 'test-product',
        images: [],
      },
    },
  ],
};

const emptyCart: CartWithItems = { ...cartWithItems, items: [] };

const cartWithLowStock: CartWithItems = {
  ...cartWithItems,
  items: [
    {
      ...cartWithItems.items[0],
      quantity: 5, // exceeds the position stock of 1 below
      product: { ...cartWithItems.items[0].product, stock: 1 },
    },
  ],
};

// ─── Order mock data ──────────────────────────────────────────────────────────

const makeOrder = (overrides: Partial<OrderWithItems> = {}): OrderWithItems => ({
  id: 'order-uuid-1',
  userId: USER_ID,
  status: OrderStatus.PENDING,
  paymentStatus: PaymentStatus.PENDING,
  subtotal: { toString: () => '69.97' },
  discount: { toString: () => '0' },
  shippingCost: { toString: () => '0' },
  tax: { toString: () => '0' },
  total: { toString: () => '69.97' },
  shippingAddress: address as never,
  billingAddress: address as never,
  notes: null,
  createdAt: now,
  updatedAt: now,
  restockedAt: null,
  items: [
    {
      id: 'order-item-1',
      orderId: 'order-uuid-1',
      productId: 'product-uuid-1',
      quantity: 2,
      price: { toString: () => '29.99' },
      createdAt: now,
      product: {
        id: 'product-uuid-1',
        name: 'iPhone 15 Pro Case',
        slug: 'iphone-15-pro-case',
        images: [],
      },
    },
  ],
  ...overrides,
});

// ─── Mocks ────────────────────────────────────────────────────────────────────

const orderRepositoryMock = {
  createFromCart: jest.fn(),
  findByUserId: jest.fn(),
  findAll: jest.fn(),
  findById: jest.fn(),
  findByIdForAdmin: jest.fn(),
  updateStatus: jest.fn(),
  cancelAndRestock: jest.fn(),
  reviveAndReserve: jest.fn(),
  updatePaymentStatus: jest.fn(),
};

const cartRepositoryMock = {
  findByUserId: jest.fn(),
};

const userRepositoryMock = {
  findById: jest.fn(),
};

// The order-confirmation email is now enqueued into the transactional outbox
// (TASK-103-F) INSIDE the order's transaction — no synchronous SMTP send.
const mailOutboxServiceMock = {
  enqueueOrderConfirmation: jest.fn(),
};

/** Fake transaction client handed to the createFromCart afterCreate hook. */
const txMock = { mailOutbox: { create: jest.fn() } };

/**
 * Default createFromCart behaviour: resolve to a created order AND drive the
 * in-transaction afterCreate hook (so the outbox enqueue runs), mirroring the
 * real repository which invokes the hook inside its `$transaction`.
 */
const resolveCreateWithHook = (order: OrderWithItems = makeOrder()) =>
  orderRepositoryMock.createFromCart.mockImplementation(
    async (
      _params: unknown,
      afterCreate?: (tx: unknown, created: OrderWithItems) => Promise<void>,
    ) => {
      if (afterCreate) await afterCreate(txMock, order);
      return order;
    },
  );

const deliveryServiceMock = {
  estimateShipping: jest.fn(),
};

const discountServiceMock = {
  computeDiscount: jest.fn(),
  redeem: jest.fn(),
};

const pinoLoggerMock = {
  setContext: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
};

const recipient = {
  id: USER_ID,
  email: 'olena@example.com',
  firstName: 'Olena',
  lastName: 'Shevchenko',
  isActive: true,
} as User;

const bannedUser = { ...recipient, isActive: false } as User;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('OrderService', () => {
  let service: OrderService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: OrderRepository, useValue: orderRepositoryMock },
        { provide: CartRepository, useValue: cartRepositoryMock },
        { provide: UserRepository, useValue: userRepositoryMock },
        { provide: MailOutboxService, useValue: mailOutboxServiceMock },
        { provide: DeliveryService, useValue: deliveryServiceMock },
        { provide: DiscountService, useValue: discountServiceMock },
        { provide: PinoLogger, useValue: pinoLoggerMock },
      ],
    }).compile();

    service = module.get<OrderService>(OrderService);
  });

  // ─── createOrder ──────────────────────────────────────────────────────────

  describe('createOrder', () => {
    // The placing user is fetched and active-checked before any cart work
    // (TASK-150). Seed an active account so the happy-path cases reach the cart.
    beforeEach(() => {
      userRepositoryMock.findById.mockResolvedValue(recipient);
    });

    it('should create an order from the cart and return an OrderEntity', async () => {
      cartRepositoryMock.findByUserId.mockResolvedValue(cartWithItems);
      orderRepositoryMock.createFromCart.mockResolvedValue(makeOrder());

      const result = await service.createOrder(USER_ID, createDto);

      expect(result).toBeInstanceOf(OrderEntity);
      expect(result.userId).toBe(USER_ID);
      expect(result.status).toBe(OrderStatus.PENDING);
    });

    it('should pass the cart id, items and address to the repository', async () => {
      cartRepositoryMock.findByUserId.mockResolvedValue(cartWithItems);
      orderRepositoryMock.createFromCart.mockResolvedValue(makeOrder());

      await service.createOrder(USER_ID, createDto);

      expect(orderRepositoryMock.createFromCart).toHaveBeenCalledWith(
        {
          userId: USER_ID,
          cartId: 'cart-uuid-1',
          cartItems: cartWithItems.items,
          shippingAddress: address,
          billingAddress: undefined,
          notes: undefined,
        },
        // TASK-103-F: in-transaction outbox-enqueue hook passed as 2nd arg.
        expect.any(Function),
      );
    });

    it('does not estimate shipping for a free-text order (no npCityRef)', async () => {
      cartRepositoryMock.findByUserId.mockResolvedValue(cartWithItems);
      orderRepositoryMock.createFromCart.mockResolvedValue(makeOrder());

      await service.createOrder(USER_ID, createDto);

      expect(deliveryServiceMock.estimateShipping).not.toHaveBeenCalled();
      expect(orderRepositoryMock.createFromCart.mock.calls[0][0]).not.toHaveProperty(
        'shippingCost',
      );
    });

    it('estimates and forwards the NP shipping cost when npCityRef is present', async () => {
      const npDto: CreateOrderDto = {
        shippingAddress: { ...address, npCityRef: 'city-ref-1', npWarehouseRef: 'wh-ref-1' },
      };
      cartRepositoryMock.findByUserId.mockResolvedValue(cartWithItems);
      orderRepositoryMock.createFromCart.mockResolvedValue(makeOrder());
      deliveryServiceMock.estimateShipping.mockResolvedValue({ cost: '60.00', etaDays: 2 });

      await service.createOrder(USER_ID, npDto);

      expect(deliveryServiceMock.estimateShipping).toHaveBeenCalledWith('city-ref-1');
      expect(orderRepositoryMock.createFromCart).toHaveBeenCalledWith(
        expect.objectContaining({ shippingCost: 60 }),
        expect.any(Function),
      );
    });

    it('falls back to 0 shipping when the estimate throws (order still created)', async () => {
      const npDto: CreateOrderDto = {
        shippingAddress: { ...address, npCityRef: 'city-ref-1' },
      };
      cartRepositoryMock.findByUserId.mockResolvedValue(cartWithItems);
      orderRepositoryMock.createFromCart.mockResolvedValue(makeOrder());
      deliveryServiceMock.estimateShipping.mockRejectedValue(new Error('NP down'));

      await service.createOrder(USER_ID, npDto);

      expect(orderRepositoryMock.createFromCart).toHaveBeenCalledWith(
        expect.objectContaining({ shippingCost: 0 }),
        expect.any(Function),
      );
    });

    // ─── TASK-079 discount integration ────────────────────────────────────────

    it('recomputes a promo code and forwards the discount to the repository', async () => {
      const discountDto: CreateOrderDto = { shippingAddress: address, discountCode: 'SUMMER10' };
      cartRepositoryMock.findByUserId.mockResolvedValue(cartWithItems);
      orderRepositoryMock.createFromCart.mockResolvedValue(makeOrder());
      discountServiceMock.computeDiscount.mockResolvedValue({
        discount: { id: 'd1', code: 'SUMMER10' },
        amount: '3.00',
      });

      await service.createOrder(USER_ID, discountDto);

      // Subtotal is computed server-side (29.99 × 2 + 9.99 × 1 = 69.97) and
      // passed to the authoritative recompute — never a client-sent amount.
      expect(discountServiceMock.computeDiscount).toHaveBeenCalledWith(
        'SUMMER10',
        '69.97',
        USER_ID,
      );
      expect(orderRepositoryMock.createFromCart).toHaveBeenCalledWith(
        expect.objectContaining({
          discount: expect.objectContaining({ amount: '3.00', code: 'SUMMER10' }),
        }),
        // TASK-103: createFromCart now also receives the in-transaction
        // afterCreate callback (mail-outbox enqueue) as a second argument.
        expect.any(Function),
      );
    });

    it('binds a redeem closure that delegates to DiscountService.redeem', async () => {
      const discountDto: CreateOrderDto = { shippingAddress: address, discountCode: 'SUMMER10' };
      cartRepositoryMock.findByUserId.mockResolvedValue(cartWithItems);
      orderRepositoryMock.createFromCart.mockResolvedValue(makeOrder());
      discountServiceMock.computeDiscount.mockResolvedValue({
        discount: { id: 'd1', code: 'SUMMER10' },
        amount: '3.00',
      });

      await service.createOrder(USER_ID, discountDto);

      const params = orderRepositoryMock.createFromCart.mock.calls[0][0];
      const fakeTx = {} as never;
      await params.discount.redeem('order-1', fakeTx);
      expect(discountServiceMock.redeem).toHaveBeenCalledWith('d1', USER_ID, 'order-1', fakeTx);
    });

    it('does not touch the discount service when no code is supplied', async () => {
      cartRepositoryMock.findByUserId.mockResolvedValue(cartWithItems);
      orderRepositoryMock.createFromCart.mockResolvedValue(makeOrder());

      await service.createOrder(USER_ID, createDto);

      expect(discountServiceMock.computeDiscount).not.toHaveBeenCalled();
      expect(orderRepositoryMock.createFromCart.mock.calls[0][0]).not.toHaveProperty('discount');
    });

    it('should throw NotFoundException when the user has no cart', async () => {
      cartRepositoryMock.findByUserId.mockResolvedValue(null);

      await expect(service.createOrder(USER_ID, createDto)).rejects.toThrow(NotFoundException);
      expect(orderRepositoryMock.createFromCart).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when the cart is empty', async () => {
      cartRepositoryMock.findByUserId.mockResolvedValue(emptyCart);

      await expect(service.createOrder(USER_ID, createDto)).rejects.toThrow(BadRequestException);
      expect(orderRepositoryMock.createFromCart).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when a position has insufficient stock', async () => {
      cartRepositoryMock.findByUserId.mockResolvedValue(cartWithLowStock);

      await expect(service.createOrder(USER_ID, createDto)).rejects.toThrow(BadRequestException);
      expect(orderRepositoryMock.createFromCart).not.toHaveBeenCalled();
    });
  });

  // ─── createOrder → ban enforcement (TASK-150) ───────────────────────────────
  // A deactivated account must not place an order even while it still holds a
  // non-expired access token. The guard runs FIRST — before cart lookup or any
  // write — so a banned user never touches inventory.

  describe('createOrder — ban enforcement', () => {
    it('throws ForbiddenException when the placing user is inactive (banned)', async () => {
      userRepositoryMock.findById.mockResolvedValue(bannedUser);
      cartRepositoryMock.findByUserId.mockResolvedValue(cartWithItems);

      await expect(service.createOrder(USER_ID, createDto)).rejects.toThrow(ForbiddenException);
      expect(orderRepositoryMock.createFromCart).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the user no longer exists', async () => {
      userRepositoryMock.findById.mockResolvedValue(null);
      cartRepositoryMock.findByUserId.mockResolvedValue(cartWithItems);

      await expect(service.createOrder(USER_ID, createDto)).rejects.toThrow(ForbiddenException);
      expect(orderRepositoryMock.createFromCart).not.toHaveBeenCalled();
    });

    it('checks the user before touching the cart (no inventory work for a banned user)', async () => {
      userRepositoryMock.findById.mockResolvedValue(bannedUser);
      cartRepositoryMock.findByUserId.mockResolvedValue(cartWithItems);

      await expect(service.createOrder(USER_ID, createDto)).rejects.toThrow(ForbiddenException);
      expect(cartRepositoryMock.findByUserId).not.toHaveBeenCalled();
    });

    it('fetches the user exactly once on the happy path (reused for the email)', async () => {
      userRepositoryMock.findById.mockResolvedValue(recipient);
      cartRepositoryMock.findByUserId.mockResolvedValue(cartWithItems);
      orderRepositoryMock.createFromCart.mockResolvedValue(makeOrder());

      await service.createOrder(USER_ID, createDto);

      expect(userRepositoryMock.findById).toHaveBeenCalledTimes(1);
      expect(userRepositoryMock.findById).toHaveBeenCalledWith(USER_ID);
    });
  });

  // ─── createOrder → outbox enqueue (transactional outbox, TASK-103-F) ────────
  // The confirmation email is no longer sent synchronously; it is enqueued into
  // the mail outbox INSIDE the order's transaction (the repository drives the
  // afterCreate hook). A background worker dispatches it later.

  describe('createOrder — outbox enqueue', () => {
    beforeEach(() => {
      cartRepositoryMock.findByUserId.mockResolvedValue(cartWithItems);
      resolveCreateWithHook();
    });

    it('enqueues an order-confirmation outbox row for the recipient in the transaction', async () => {
      userRepositoryMock.findById.mockResolvedValue(recipient);

      const result = await service.createOrder(USER_ID, createDto);

      expect(mailOutboxServiceMock.enqueueOrderConfirmation).toHaveBeenCalledTimes(1);
      const [params, tx] = mailOutboxServiceMock.enqueueOrderConfirmation.mock.calls[0];
      expect(params).toEqual({
        to: recipient.email,
        order: expect.any(OrderEntity),
        customerName: recipient.firstName,
      });
      // Enqueued through the order's transaction client (atomic with the order).
      expect(tx).toBe(txMock);
      expect(result).toBeInstanceOf(OrderEntity);
    });

    it('does NOT perform a synchronous SMTP send (no MailService instance call)', async () => {
      userRepositoryMock.findById.mockResolvedValue(recipient);

      await service.createOrder(USER_ID, createDto);

      // OrderService no longer depends on MailService at all — the only mail
      // interaction is the outbox enqueue above.
      expect(mailOutboxServiceMock.enqueueOrderConfirmation).toHaveBeenCalledTimes(1);
    });

    it('reuses the guard-fetched user for the enqueue (no second lookup)', async () => {
      userRepositoryMock.findById.mockResolvedValue(recipient);

      await service.createOrder(USER_ID, createDto);

      expect(userRepositoryMock.findById).toHaveBeenCalledTimes(1);
      expect(mailOutboxServiceMock.enqueueOrderConfirmation).toHaveBeenCalledTimes(1);
    });
  });

  // ─── getOrders ──────────────────────────────────────────────────────────────

  describe('getOrders', () => {
    it('should return a paginated list with data and meta', async () => {
      orderRepositoryMock.findByUserId.mockResolvedValue({ orders: [makeOrder()], total: 1 });

      const result = await service.getOrders(USER_ID, {});

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toBeInstanceOf(OrderEntity);
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 10, totalPages: 1 });
    });

    it('should pass the userId and query to the repository', async () => {
      orderRepositoryMock.findByUserId.mockResolvedValue({ orders: [], total: 0 });
      const query = { status: OrderStatus.PENDING, page: 2, limit: 5 };

      await service.getOrders(USER_ID, query);

      expect(orderRepositoryMock.findByUserId).toHaveBeenCalledWith(USER_ID, query);
    });

    it('should compute totalPages from total and limit', async () => {
      orderRepositoryMock.findByUserId.mockResolvedValue({ orders: [], total: 23 });

      const result = await service.getOrders(USER_ID, { limit: 10 });

      expect(result.meta).toEqual({ total: 23, page: 1, limit: 10, totalPages: 3 });
    });
  });

  // ─── getOrder ─────────────────────────────────────────────────────────────

  describe('getOrder', () => {
    it('should return the order when it belongs to the user', async () => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder());

      const result = await service.getOrder(USER_ID, 'order-uuid-1');

      expect(result).toBeInstanceOf(OrderEntity);
      expect(result.id).toBe('order-uuid-1');
    });

    it('should throw NotFoundException when the order does not exist', async () => {
      orderRepositoryMock.findById.mockResolvedValue(null);

      await expect(service.getOrder(USER_ID, 'missing')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when the order belongs to another user', async () => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder({ userId: OTHER_USER_ID }));

      await expect(service.getOrder(USER_ID, 'order-uuid-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── cancelOrder ──────────────────────────────────────────────────────────

  describe('cancelOrder', () => {
    it('should cancel a PENDING order owned by the user and release reserved stock', async () => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder({ status: OrderStatus.PENDING }));
      orderRepositoryMock.cancelAndRestock.mockResolvedValue(
        makeOrder({ status: OrderStatus.CANCELLED }),
      );

      const result = await service.cancelOrder(USER_ID, 'order-uuid-1');

      expect(orderRepositoryMock.cancelAndRestock).toHaveBeenCalledWith('order-uuid-1');
      expect(result.status).toBe(OrderStatus.CANCELLED);
    });

    it('should throw NotFoundException when the order is not found', async () => {
      orderRepositoryMock.findById.mockResolvedValue(null);

      await expect(service.cancelOrder(USER_ID, 'missing')).rejects.toThrow(NotFoundException);
      expect(orderRepositoryMock.cancelAndRestock).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when the order belongs to another user', async () => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder({ userId: OTHER_USER_ID }));

      await expect(service.cancelOrder(USER_ID, 'order-uuid-1')).rejects.toThrow(NotFoundException);
      expect(orderRepositoryMock.cancelAndRestock).not.toHaveBeenCalled();
    });

    it.each([
      OrderStatus.CONFIRMED,
      OrderStatus.PROCESSING,
      OrderStatus.SHIPPED,
      OrderStatus.DELIVERED,
    ])('should throw ConflictException when the order status is %s', async (status) => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder({ status }));

      await expect(service.cancelOrder(USER_ID, 'order-uuid-1')).rejects.toThrow(ConflictException);
      expect(orderRepositoryMock.cancelAndRestock).not.toHaveBeenCalled();
    });
  });

  // ─── updateStatus (internal) ────────────────────────────────────────────────

  describe('updateStatus', () => {
    it('should update the order status without an ownership check', async () => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder({ status: OrderStatus.PENDING }));
      orderRepositoryMock.updateStatus.mockResolvedValue(
        makeOrder({ status: OrderStatus.CONFIRMED, paymentStatus: PaymentStatus.PENDING }),
      );

      const result = await service.updateStatus('order-uuid-1', OrderStatus.CONFIRMED);

      // TASK-151: paymentStatus is forwarded unchanged (PENDING), not auto-derived.
      expect(orderRepositoryMock.updateStatus).toHaveBeenCalledWith(
        'order-uuid-1',
        OrderStatus.CONFIRMED,
        PaymentStatus.PENDING,
      );
      expect(result.status).toBe(OrderStatus.CONFIRMED);
    });

    it('should throw NotFoundException when the order does not exist', async () => {
      orderRepositoryMock.findById.mockResolvedValue(null);

      await expect(service.updateStatus('missing', OrderStatus.CONFIRMED)).rejects.toThrow(
        NotFoundException,
      );
      expect(orderRepositoryMock.updateStatus).not.toHaveBeenCalled();
    });
  });

  // ─── updateStatus — decoupled (no auto-derive) (TASK-151) ─────────────────────
  // TASK-151: coupling removed — paymentStatus is no longer auto-derived from the
  // target order status. Advancing the order status leaves the existing payment
  // status untouched; the admin manages payment separately via
  // adminUpdatePaymentStatus. This replaces the former TASK-123 coupling block.

  describe('updateStatus — decoupled (no auto-derive)', () => {
    // The repository echoes whatever the service hands it; these tests assert on
    // the call arguments — i.e. that the service forwards the order's CURRENT
    // payment status unchanged rather than deriving a new one.
    const seedAndEcho = (current: Partial<OrderWithItems>) => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder(current));
      orderRepositoryMock.updateStatus.mockImplementation(
        (_id: string, status: OrderStatus, paymentStatus: PaymentStatus) =>
          Promise.resolve(makeOrder({ status, paymentStatus })),
      );
    };

    it.each([
      OrderStatus.CONFIRMED,
      OrderStatus.PROCESSING,
      OrderStatus.SHIPPED,
      OrderStatus.DELIVERED,
    ])('preserves paymentStatus PENDING when advancing PENDING → %s', async (status) => {
      seedAndEcho({ status: OrderStatus.PENDING, paymentStatus: PaymentStatus.PENDING });

      const result = await service.updateStatus('order-uuid-1', status);

      expect(orderRepositoryMock.updateStatus).toHaveBeenCalledWith(
        'order-uuid-1',
        status,
        PaymentStatus.PENDING,
      );
      expect(result.paymentStatus).toBe(PaymentStatus.PENDING);
    });

    it('does NOT auto-set REFUNDED when an order is moved to REFUNDED (payment preserved)', async () => {
      seedAndEcho({ status: OrderStatus.DELIVERED, paymentStatus: PaymentStatus.PAID });

      await service.updateStatus('order-uuid-1', OrderStatus.REFUNDED);

      expect(orderRepositoryMock.updateStatus).toHaveBeenCalledWith(
        'order-uuid-1',
        OrderStatus.REFUNDED,
        PaymentStatus.PAID,
      );
    });

    it('leaves an already-PAID order PAID when advanced further', async () => {
      seedAndEcho({ status: OrderStatus.PROCESSING, paymentStatus: PaymentStatus.PAID });

      await service.updateStatus('order-uuid-1', OrderStatus.DELIVERED);

      expect(orderRepositoryMock.updateStatus).toHaveBeenCalledWith(
        'order-uuid-1',
        OrderStatus.DELIVERED,
        PaymentStatus.PAID,
      );
    });
  });

  // ─── adminUpdatePaymentStatus (admin) (TASK-151) ──────────────────────────────
  // The admin sets payment status directly and independently of the order status.

  describe('adminUpdatePaymentStatus', () => {
    it('sets PAID on a PENDING order via the repository', async () => {
      orderRepositoryMock.findById.mockResolvedValue(
        makeOrder({ status: OrderStatus.PENDING, paymentStatus: PaymentStatus.PENDING }),
      );
      orderRepositoryMock.updatePaymentStatus.mockResolvedValue(
        makeOrder({ status: OrderStatus.PENDING, paymentStatus: PaymentStatus.PAID }),
      );

      const result = await service.adminUpdatePaymentStatus('order-uuid-1', PaymentStatus.PAID);

      expect(orderRepositoryMock.updatePaymentStatus).toHaveBeenCalledWith(
        'order-uuid-1',
        PaymentStatus.PAID,
      );
      expect(result).toBeInstanceOf(OrderEntity);
      expect(result.paymentStatus).toBe(PaymentStatus.PAID);
    });

    it('sets REFUNDED on a DELIVERED order without changing the order status', async () => {
      orderRepositoryMock.findById.mockResolvedValue(
        makeOrder({ status: OrderStatus.DELIVERED, paymentStatus: PaymentStatus.PAID }),
      );
      orderRepositoryMock.updatePaymentStatus.mockResolvedValue(
        makeOrder({ status: OrderStatus.DELIVERED, paymentStatus: PaymentStatus.REFUNDED }),
      );

      const result = await service.adminUpdatePaymentStatus('order-uuid-1', PaymentStatus.REFUNDED);

      expect(orderRepositoryMock.updatePaymentStatus).toHaveBeenCalledWith(
        'order-uuid-1',
        PaymentStatus.REFUNDED,
      );
      expect(result.status).toBe(OrderStatus.DELIVERED);
      expect(result.paymentStatus).toBe(PaymentStatus.REFUNDED);
    });

    it('throws NotFoundException when the order does not exist', async () => {
      orderRepositoryMock.findById.mockResolvedValue(null);

      await expect(service.adminUpdatePaymentStatus('missing', PaymentStatus.PAID)).rejects.toThrow(
        NotFoundException,
      );
      expect(orderRepositoryMock.updatePaymentStatus).not.toHaveBeenCalled();
    });
  });

  // ─── updateStatus — stock restock on cancel (TASK-124) ────────────────────────
  // Stock is reserved at order creation. Returning it to inventory is automatic
  // ONLY when an order is cancelled before it ships (PENDING/CONFIRMED/PROCESSING),
  // because the goods are still in the warehouse. Post-shipment cancels (SHIPPED/
  // DELIVERED) and all refunds require a MANUAL stock adjustment after the
  // physical return is received — so the service must NOT auto-restock those.

  describe('updateStatus — stock restock on cancel', () => {
    const seed = (current: Partial<OrderWithItems>) => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder(current));
      orderRepositoryMock.cancelAndRestock.mockImplementation((_id: string) =>
        Promise.resolve(makeOrder({ ...current, status: OrderStatus.CANCELLED })),
      );
      orderRepositoryMock.updateStatus.mockImplementation(
        (_id: string, status: OrderStatus, paymentStatus: PaymentStatus) =>
          Promise.resolve(makeOrder({ status, paymentStatus })),
      );
    };

    // ── Auto-restock: pre-shipment cancels return the reserved stock ──
    it.each([OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PROCESSING])(
      'auto-returns reserved stock when cancelling a pre-shipment order (%s → CANCELLED)',
      async (from) => {
        seed({
          status: from,
          paymentStatus: from === OrderStatus.PENDING ? PaymentStatus.PENDING : PaymentStatus.PAID,
        });

        const result = await service.updateStatus('order-uuid-1', OrderStatus.CANCELLED);

        expect(orderRepositoryMock.cancelAndRestock).toHaveBeenCalledWith('order-uuid-1');
        expect(orderRepositoryMock.updateStatus).not.toHaveBeenCalled();
        expect(result.status).toBe(OrderStatus.CANCELLED);
      },
    );

    it('preserves paymentStatus PAID on a paid pre-shipment cancel (refund is a separate step)', async () => {
      seed({ status: OrderStatus.CONFIRMED, paymentStatus: PaymentStatus.PAID });
      orderRepositoryMock.cancelAndRestock.mockResolvedValue(
        makeOrder({ status: OrderStatus.CANCELLED, paymentStatus: PaymentStatus.PAID }),
      );

      const result = await service.updateStatus('order-uuid-1', OrderStatus.CANCELLED);

      expect(result.paymentStatus).toBe(PaymentStatus.PAID);
    });

    // ── Manual restock: post-shipment cancels / refunds do NOT auto-restock ──
    it.each([OrderStatus.SHIPPED, OrderStatus.DELIVERED])(
      'does NOT auto-restock when cancelling a post-shipment order (%s → CANCELLED, manual return)',
      async (from) => {
        seed({ status: from, paymentStatus: PaymentStatus.PAID });

        await service.updateStatus('order-uuid-1', OrderStatus.CANCELLED);

        expect(orderRepositoryMock.cancelAndRestock).not.toHaveBeenCalled();
        expect(orderRepositoryMock.updateStatus).toHaveBeenCalledWith(
          'order-uuid-1',
          OrderStatus.CANCELLED,
          PaymentStatus.PAID,
        );
      },
    );

    it('does NOT auto-restock when refunding a delivered order (manual return required)', async () => {
      seed({ status: OrderStatus.DELIVERED, paymentStatus: PaymentStatus.PAID });

      await service.updateStatus('order-uuid-1', OrderStatus.REFUNDED);

      expect(orderRepositoryMock.cancelAndRestock).not.toHaveBeenCalled();
      // TASK-151: paymentStatus is preserved (PAID), not auto-set to REFUNDED.
      // The admin sets payment status separately via adminUpdatePaymentStatus.
      expect(orderRepositoryMock.updateStatus).toHaveBeenCalledWith(
        'order-uuid-1',
        OrderStatus.REFUNDED,
        PaymentStatus.PAID,
      );
    });

    it('does NOT restock again when an already-CANCELLED order is set to CANCELLED (no double credit)', async () => {
      seed({ status: OrderStatus.CANCELLED, paymentStatus: PaymentStatus.PAID });

      await service.updateStatus('order-uuid-1', OrderStatus.CANCELLED);

      expect(orderRepositoryMock.cancelAndRestock).not.toHaveBeenCalled();
      expect(orderRepositoryMock.updateStatus).toHaveBeenCalledWith(
        'order-uuid-1',
        OrderStatus.CANCELLED,
        PaymentStatus.PAID,
      );
    });

    it('does NOT restock on a forward transition (PENDING → CONFIRMED)', async () => {
      seed({ status: OrderStatus.PENDING, paymentStatus: PaymentStatus.PENDING });

      await service.updateStatus('order-uuid-1', OrderStatus.CONFIRMED);

      expect(orderRepositoryMock.cancelAndRestock).not.toHaveBeenCalled();
    });

    it('throws NotFoundException and restocks nothing when the order does not exist', async () => {
      orderRepositoryMock.findById.mockResolvedValue(null);

      await expect(service.updateStatus('missing', OrderStatus.CANCELLED)).rejects.toThrow(
        NotFoundException,
      );
      expect(orderRepositoryMock.cancelAndRestock).not.toHaveBeenCalled();
      expect(orderRepositoryMock.updateStatus).not.toHaveBeenCalled();
    });
  });

  // ─── updateStatus — stock re-reserve on revive (TASK-228) ─────────────────────
  // A pre-shipment cancel credits the order's stock back and stamps restockedAt.
  // TASK-151 lets the admin move the order to ANY status afterwards, so reviving
  // such an order into a live status must re-reserve its stock — otherwise a
  // later re-cancel would credit the same units a second time (the double-credit
  // bug reproduced in manual QA §C2-a).

  describe('updateStatus — stock re-reserve on revive (TASK-228)', () => {
    const restockedAt = new Date('2026-07-04T10:00:00.000Z');

    const seed = (current: Partial<OrderWithItems>) => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder(current));
      orderRepositoryMock.reviveAndReserve.mockImplementation(
        (_id: string, status: OrderStatus, paymentStatus: PaymentStatus) =>
          Promise.resolve(makeOrder({ status, paymentStatus, restockedAt: null })),
      );
      orderRepositoryMock.updateStatus.mockImplementation(
        (_id: string, status: OrderStatus, paymentStatus: PaymentStatus) =>
          Promise.resolve(makeOrder({ ...current, status, paymentStatus })),
      );
      orderRepositoryMock.cancelAndRestock.mockImplementation((_id: string) =>
        Promise.resolve(makeOrder({ ...current, status: OrderStatus.CANCELLED, restockedAt })),
      );
    };

    it.each([
      OrderStatus.PENDING,
      OrderStatus.CONFIRMED,
      OrderStatus.PROCESSING,
      OrderStatus.SHIPPED,
      OrderStatus.DELIVERED,
    ])(
      're-reserves stock when reviving a restocked CANCELLED order (CANCELLED → %s)',
      async (to) => {
        seed({ status: OrderStatus.CANCELLED, paymentStatus: PaymentStatus.PAID, restockedAt });

        const result = await service.updateStatus('order-uuid-1', to);

        expect(orderRepositoryMock.reviveAndReserve).toHaveBeenCalledWith(
          'order-uuid-1',
          to,
          PaymentStatus.PAID,
        );
        expect(orderRepositoryMock.updateStatus).not.toHaveBeenCalled();
        expect(orderRepositoryMock.cancelAndRestock).not.toHaveBeenCalled();
        expect(result.status).toBe(to);
      },
    );

    it('keeps the flag and touches no stock when moving a restocked CANCELLED order to REFUNDED', async () => {
      seed({ status: OrderStatus.CANCELLED, paymentStatus: PaymentStatus.PAID, restockedAt });

      await service.updateStatus('order-uuid-1', OrderStatus.REFUNDED);

      expect(orderRepositoryMock.reviveAndReserve).not.toHaveBeenCalled();
      expect(orderRepositoryMock.cancelAndRestock).not.toHaveBeenCalled();
      expect(orderRepositoryMock.updateStatus).toHaveBeenCalledWith(
        'order-uuid-1',
        OrderStatus.REFUNDED,
        PaymentStatus.PAID,
      );
    });

    it('re-reserves stock when reviving a restocked REFUNDED order (flag survived CANCELLED → REFUNDED)', async () => {
      seed({ status: OrderStatus.REFUNDED, paymentStatus: PaymentStatus.REFUNDED, restockedAt });

      await service.updateStatus('order-uuid-1', OrderStatus.PENDING);

      expect(orderRepositoryMock.reviveAndReserve).toHaveBeenCalledWith(
        'order-uuid-1',
        OrderStatus.PENDING,
        PaymentStatus.REFUNDED,
      );
      expect(orderRepositoryMock.updateStatus).not.toHaveBeenCalled();
    });

    it('does NOT reserve when reviving a post-shipment-cancelled order (its stock was never credited back)', async () => {
      seed({ status: OrderStatus.CANCELLED, paymentStatus: PaymentStatus.PAID, restockedAt: null });

      await service.updateStatus('order-uuid-1', OrderStatus.PENDING);

      expect(orderRepositoryMock.reviveAndReserve).not.toHaveBeenCalled();
      expect(orderRepositoryMock.updateStatus).toHaveBeenCalledWith(
        'order-uuid-1',
        OrderStatus.PENDING,
        PaymentStatus.PAID,
      );
    });

    it('propagates the 409 from the repository and leaves the order terminal when stock is gone', async () => {
      seed({ status: OrderStatus.CANCELLED, paymentStatus: PaymentStatus.PAID, restockedAt });
      orderRepositoryMock.reviveAndReserve.mockRejectedValue(
        new ConflictException(
          'Insufficient stock for "iPhone 15 Pro Case" — cannot revive the order',
        ),
      );

      await expect(service.updateStatus('order-uuid-1', OrderStatus.PENDING)).rejects.toThrow(
        ConflictException,
      );
      expect(orderRepositoryMock.updateStatus).not.toHaveBeenCalled();
      expect(orderRepositoryMock.cancelAndRestock).not.toHaveBeenCalled();
    });

    it('belt-and-braces: does NOT restock a live order whose flag is somehow still set (no double credit)', async () => {
      // Anomalous state (only reachable by edits outside the service): a live
      // PENDING order with restockedAt set. Cancelling it must NOT credit stock.
      seed({ status: OrderStatus.PENDING, paymentStatus: PaymentStatus.PENDING, restockedAt });

      await service.updateStatus('order-uuid-1', OrderStatus.CANCELLED);

      expect(orderRepositoryMock.cancelAndRestock).not.toHaveBeenCalled();
      expect(orderRepositoryMock.updateStatus).toHaveBeenCalledWith(
        'order-uuid-1',
        OrderStatus.CANCELLED,
        PaymentStatus.PENDING,
      );
    });
  });

  // ─── adminGetAllOrders (admin) ──────────────────────────────────────────────

  describe('adminGetAllOrders', () => {
    it('should return a paginated list of all users orders with data and meta', async () => {
      orderRepositoryMock.findAll.mockResolvedValue({
        orders: [makeOrder(), makeOrder({ userId: OTHER_USER_ID })],
        total: 2,
      });

      const result = await service.adminGetAllOrders({});

      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toBeInstanceOf(OrderEntity);
      expect(result.meta).toEqual({ total: 2, page: 1, limit: 10, totalPages: 1 });
    });

    it('should pass the query (status, userId, date range, pagination) to the repository', async () => {
      orderRepositoryMock.findAll.mockResolvedValue({ orders: [], total: 0 });
      const query = {
        status: OrderStatus.SHIPPED,
        userId: OTHER_USER_ID,
        dateFrom: '2026-01-01',
        dateTo: '2026-12-31',
        page: 2,
        limit: 5,
      };

      await service.adminGetAllOrders(query);

      expect(orderRepositoryMock.findAll).toHaveBeenCalledWith(query);
    });

    it('should compute totalPages from total and limit', async () => {
      orderRepositoryMock.findAll.mockResolvedValue({ orders: [], total: 23 });

      const result = await service.adminGetAllOrders({ limit: 10 });

      expect(result.meta).toEqual({ total: 23, page: 1, limit: 10, totalPages: 3 });
    });
  });

  // ─── adminGetOrder (admin) ──────────────────────────────────────────────────

  describe('adminGetOrder', () => {
    it('should return any order by ID via the admin (customer-joined) read', async () => {
      orderRepositoryMock.findByIdForAdmin.mockResolvedValue(makeOrder({ userId: OTHER_USER_ID }));

      const result = await service.adminGetOrder('order-uuid-1');

      expect(result).toBeInstanceOf(OrderEntity);
      expect(result.id).toBe('order-uuid-1');
      expect(result.userId).toBe(OTHER_USER_ID);
    });

    it('should throw NotFoundException when the order does not exist', async () => {
      orderRepositoryMock.findByIdForAdmin.mockResolvedValue(null);

      await expect(service.adminGetOrder('missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── adminGetOrder — customer data (TASK-125) ─────────────────────────────────
  // Admin order reads join the owning user so the admin can see who placed the
  // order (account email + name). Customer-facing reads must NOT load this.

  describe('adminGetOrder — customer data', () => {
    const customer = {
      id: OTHER_USER_ID,
      email: 'buyer@example.com',
      firstName: 'Ivan',
      lastName: 'Petrenko',
    };

    it('reads via findByIdForAdmin, not the lean findById', async () => {
      orderRepositoryMock.findByIdForAdmin.mockResolvedValue(
        makeOrder({ userId: OTHER_USER_ID, user: customer }),
      );

      await service.adminGetOrder('order-uuid-1');

      expect(orderRepositoryMock.findByIdForAdmin).toHaveBeenCalledWith('order-uuid-1');
      expect(orderRepositoryMock.findById).not.toHaveBeenCalled();
    });

    it('maps the joined user onto OrderEntity.customer', async () => {
      orderRepositoryMock.findByIdForAdmin.mockResolvedValue(
        makeOrder({ userId: OTHER_USER_ID, user: customer }),
      );

      const result = await service.adminGetOrder('order-uuid-1');

      expect(result.customer).toEqual(customer);
    });

    it('leaves customer undefined when the order has no joined user', async () => {
      orderRepositoryMock.findByIdForAdmin.mockResolvedValue(makeOrder());

      const result = await service.adminGetOrder('order-uuid-1');

      expect(result.customer).toBeUndefined();
    });

    it('exposes customer on every order in the admin list', async () => {
      orderRepositoryMock.findAll.mockResolvedValue({
        orders: [makeOrder({ userId: OTHER_USER_ID, user: customer })],
        total: 1,
      });

      const result = await service.adminGetAllOrders({});

      expect(result.data[0].customer).toEqual(customer);
    });
  });

  // ─── OrderEntity.fromPrisma — customer mapping (TASK-125) ─────────────────────

  describe('OrderEntity.fromPrisma — customer mapping', () => {
    it('sets customer with all four fields when user is present', () => {
      const entity = OrderEntity.fromPrisma(
        makeOrder({
          user: { id: 'u-1', email: 'a@b.ua', firstName: 'Ada', lastName: 'Byron' },
        }),
      );

      expect(entity.customer).toEqual({
        id: 'u-1',
        email: 'a@b.ua',
        firstName: 'Ada',
        lastName: 'Byron',
      });
    });

    it('leaves customer undefined when user is absent', () => {
      const entity = OrderEntity.fromPrisma(makeOrder());

      expect(entity.customer).toBeUndefined();
    });

    it('maps null first/last names through', () => {
      const entity = OrderEntity.fromPrisma(
        makeOrder({
          user: { id: 'u-2', email: 'c@d.ua', firstName: null, lastName: null },
        }),
      );

      expect(entity.customer).toEqual({
        id: 'u-2',
        email: 'c@d.ua',
        firstName: null,
        lastName: null,
      });
    });
  });

  // ─── OrderEntity.fromPrisma — restockedAt pass-through (TASK-254) ─────────────

  describe('OrderEntity.fromPrisma — restockedAt', () => {
    it('round-trips restockedAt when null (order still holds stock / never restocked)', () => {
      const entity = OrderEntity.fromPrisma(makeOrder({ restockedAt: null }));

      expect(entity.restockedAt).toBeNull();
    });

    it('round-trips restockedAt when a Date (stock returned on cancellation, TASK-228)', () => {
      const restockedAt = new Date('2026-07-08T10:30:00.000Z');
      const entity = OrderEntity.fromPrisma(makeOrder({ restockedAt }));

      expect(entity.restockedAt).toEqual(restockedAt);
    });
  });
});
