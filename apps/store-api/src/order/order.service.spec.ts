import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { OrderStatus, PaymentStatus, PaymentAttemptStatus } from '@prisma/client';
import { OrderRepository } from './order.repository';
import { OrderService } from './order.service';
import { OrderEntity } from './entities';
import { CartRepository, CartWithItems } from '../cart/cart.repository';
import { UserRepository } from '../user/user.repository';
import { MailOutboxService } from '../mail-outbox';
import { DeliveryService } from '../delivery';
import { DiscountService } from '../discount';
import { AddonApplicabilityResolver } from '../addon-service';
import type { User } from '@prisma/client';
import type {
  OrderActor,
  OrderWithItems,
  PaymentApplyPlan,
  PaymentWithOrderRow,
} from './order.types';
import type { CreateOrderDto } from './dto';
import { PaymentOutcome, type PaymentEventInput } from '../payment/payment.types';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = 'user-uuid-1';
const OTHER_USER_ID = 'user-uuid-2';
// TASK-251: the acting admin id threaded as `changedBy` into every admin-driven
// status/payment mutation.
const ADMIN_ID = 'admin-uuid-1';
const now = new Date('2026-06-11T12:00:00.000Z');

// TASK-338: createOrder now takes an actor, not a bare user id — exactly one of
// "an account" and "a guest with contact details" (see OrderActor).
const userActor: OrderActor = { type: 'user', userId: USER_ID };
const GUEST_CART_TOKEN = 'guest-cart-token-1';
const guestContact = {
  email: 'guest@example.com',
  phone: '+380671112233',
  name: 'Гість Гостьович',
};
const guestActor: OrderActor = {
  type: 'guest',
  cartToken: GUEST_CART_TOKEN,
  contact: guestContact,
};

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
        // TASK-297: checkout re-checks the owning category's status too.
        category: { isActive: true },
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
        category: { isActive: true },
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
  // TASK-338: guest order access + claiming on registration.
  findByAccessTokenHash: jest.fn(),
  // TASK-335/336: waybill + internal notes, and who to email about a shipment.
  updateDetails: jest.fn(),
  findRecipient: jest.fn(),
  // TASK-341: operator-created orders + pre-shipment address correction.
  findOrderableProducts: jest.fn(),
  createManual: jest.fn(),
  updateShippingAddress: jest.fn(),
  claimGuestOrders: jest.fn(),
  updateStatus: jest.fn(),
  cancelAndRestock: jest.fn(),
  reviveAndReserve: jest.fn(),
  updatePaymentStatus: jest.fn(),
  // TASK-330: the payment seam — the order module reads the attempt it is told
  // about and writes the whole application in one go.
  findPaymentWithOrder: jest.fn(),
  applyPaymentOutcome: jest.fn(),
};

const cartRepositoryMock = {
  findByUserId: jest.fn(),
  // TASK-338: a guest's cart is found by the cookie token, not a user id.
  findByToken: jest.fn(),
};

// TASK-338: GUEST_ORDER_TOKEN_TTL_DAYS and STORE_CLIENT_URL. Defaults to the
// service's own fallback when a key is not seeded, mirroring ConfigService.
const configValues = new Map<string, unknown>();
const configServiceMock = {
  get: jest.fn((key: string, fallback?: unknown) =>
    configValues.has(key) ? configValues.get(key) : fallback,
  ),
};

const userRepositoryMock = {
  findById: jest.fn(),
};

// The order-confirmation email is now enqueued into the transactional outbox
// (TASK-103-F) INSIDE the order's transaction — no synchronous SMTP send.
const mailOutboxServiceMock = {
  enqueueOrderConfirmation: jest.fn(),
  // TASK-335: the "your parcel is on its way" notice.
  enqueueOrderShipped: jest.fn(),
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

// AddonApplicabilityResolver mock (TASK-174) — the order re-resolves each line's
// add-ons fresh at creation time before freezing them into OrderItemAddon rows.
const addonResolverMock = {
  resolveForProduct: jest.fn(),
  resolveForProducts: jest.fn().mockResolvedValue(new Map()),
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('OrderService', () => {
  let service: OrderService;

  beforeEach(async () => {
    jest.clearAllMocks();
    configValues.clear();
    // Default: no add-on applies to anything (TASK-174). Individual add-on tests
    // override this.
    addonResolverMock.resolveForProducts.mockResolvedValue(new Map());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: OrderRepository, useValue: orderRepositoryMock },
        { provide: CartRepository, useValue: cartRepositoryMock },
        { provide: UserRepository, useValue: userRepositoryMock },
        { provide: MailOutboxService, useValue: mailOutboxServiceMock },
        { provide: AddonApplicabilityResolver, useValue: addonResolverMock },
        { provide: DeliveryService, useValue: deliveryServiceMock },
        { provide: DiscountService, useValue: discountServiceMock },
        { provide: ConfigService, useValue: configServiceMock },
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

      const result = await service.createOrder(userActor, createDto);

      expect(result).toBeInstanceOf(OrderEntity);
      expect(result.userId).toBe(USER_ID);
      expect(result.status).toBe(OrderStatus.PENDING);
    });

    it('should pass the cart id, items and address to the repository', async () => {
      cartRepositoryMock.findByUserId.mockResolvedValue(cartWithItems);
      orderRepositoryMock.createFromCart.mockResolvedValue(makeOrder());

      await service.createOrder(userActor, createDto);

      expect(orderRepositoryMock.createFromCart).toHaveBeenCalledWith(
        {
          userId: USER_ID,
          cartId: 'cart-uuid-1',
          cartItems: cartWithItems.items,
          // TASK-174: no line has a selected add-on in this fixture, so the
          // snapshot map is empty — but it is always passed.
          addonsByCartItemId: new Map(),
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

      await service.createOrder(userActor, createDto);

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

      await service.createOrder(userActor, npDto);

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

      await service.createOrder(userActor, npDto);

      expect(orderRepositoryMock.createFromCart).toHaveBeenCalledWith(
        expect.objectContaining({ shippingCost: 0 }),
        expect.any(Function),
      );
    });

    // ── TASK-337 (WT-D seam): "not configured" must NOT use that fallback ──────
    // A bad minute at Nova Poshta and a missing NP_API_KEY arrive at the same
    // catch block, and treating them alike means every production order silently
    // books 0.00 shipping — the shop paying for delivery out of its own pocket
    // with nothing louder than a warning to show for it.

    describe('a delivery module that was never configured', () => {
      class DeliveryNotConfiguredException extends Error {
        constructor() {
          super('Nova Poshta is not configured');
          this.name = 'DeliveryNotConfiguredException';
        }
      }

      /** The same class WITHOUT an explicit `name` — a plain-Error base. */
      class NamelessDeliveryNotConfiguredException extends Error {}
      Object.defineProperty(NamelessDeliveryNotConfiguredException, 'name', {
        value: 'DeliveryNotConfiguredException',
      });

      const npDto: CreateOrderDto = {
        shippingAddress: { ...address, npCityRef: 'city-ref-1' },
      };

      beforeEach(() => {
        cartRepositoryMock.findByUserId.mockResolvedValue(cartWithItems);
        orderRepositoryMock.createFromCart.mockResolvedValue(makeOrder());
      });

      it('lets the error out instead of booking a 0.00 shipping cost', async () => {
        deliveryServiceMock.estimateShipping.mockRejectedValue(
          new DeliveryNotConfiguredException(),
        );

        await expect(service.createOrder(userActor, npDto)).rejects.toThrow(
          'Nova Poshta is not configured',
        );
        // The order must not exist at all — a half-priced order is worse than none.
        expect(orderRepositoryMock.createFromCart).not.toHaveBeenCalled();
      });

      it('recognises it whichever base class the delivery module chose', async () => {
        deliveryServiceMock.estimateShipping.mockRejectedValue(
          new NamelessDeliveryNotConfiguredException(),
        );

        await expect(service.createOrder(userActor, npDto)).rejects.toBeInstanceOf(Error);
        expect(orderRepositoryMock.createFromCart).not.toHaveBeenCalled();
      });
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

      await service.createOrder(userActor, discountDto);

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

      await service.createOrder(userActor, discountDto);

      const params = orderRepositoryMock.createFromCart.mock.calls[0][0];
      const fakeTx = {} as never;
      await params.discount.redeem('order-1', fakeTx);
      expect(discountServiceMock.redeem).toHaveBeenCalledWith('d1', USER_ID, 'order-1', fakeTx);
    });

    it('does not touch the discount service when no code is supplied', async () => {
      cartRepositoryMock.findByUserId.mockResolvedValue(cartWithItems);
      orderRepositoryMock.createFromCart.mockResolvedValue(makeOrder());

      await service.createOrder(userActor, createDto);

      expect(discountServiceMock.computeDiscount).not.toHaveBeenCalled();
      expect(orderRepositoryMock.createFromCart.mock.calls[0][0]).not.toHaveProperty('discount');
    });

    it('should throw NotFoundException when the user has no cart', async () => {
      cartRepositoryMock.findByUserId.mockResolvedValue(null);

      await expect(service.createOrder(userActor, createDto)).rejects.toThrow(NotFoundException);
      expect(orderRepositoryMock.createFromCart).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when the cart is empty', async () => {
      cartRepositoryMock.findByUserId.mockResolvedValue(emptyCart);

      await expect(service.createOrder(userActor, createDto)).rejects.toThrow(BadRequestException);
      expect(orderRepositoryMock.createFromCart).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when a position has insufficient stock', async () => {
      cartRepositoryMock.findByUserId.mockResolvedValue(cartWithLowStock);

      await expect(service.createOrder(userActor, createDto)).rejects.toThrow(BadRequestException);
      expect(orderRepositoryMock.createFromCart).not.toHaveBeenCalled();
    });

    // ─── TASK-297: on-sale re-check at checkout ───────────────────────────────
    // A line withdrawn from sale AFTER it entered the cart must not convert into
    // an order. The add-to-cart / GET /cart gates never re-run for an existing
    // line, so createOrder is the authoritative backstop — no order, no stock
    // decrement, no confirmation email.

    it('should throw BadRequestException when a line product has been deactivated (TASK-297)', async () => {
      const cartWithInactiveProduct: CartWithItems = {
        ...cartWithItems,
        items: [
          {
            ...cartWithItems.items[0],
            product: { ...cartWithItems.items[0].product, isActive: false },
          },
        ],
      };
      cartRepositoryMock.findByUserId.mockResolvedValue(cartWithInactiveProduct);

      await expect(service.createOrder(userActor, createDto)).rejects.toThrow(BadRequestException);
      expect(orderRepositoryMock.createFromCart).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when a line category has been withdrawn from sale (TASK-297)', async () => {
      // The product itself is still active — only its category was deactivated.
      const cartWithWithdrawnCategory: CartWithItems = {
        ...cartWithItems,
        items: [
          {
            ...cartWithItems.items[0],
            product: {
              ...cartWithItems.items[0].product,
              isActive: true,
              category: { isActive: false },
            },
          },
        ],
      };
      cartRepositoryMock.findByUserId.mockResolvedValue(cartWithWithdrawnCategory);

      await expect(service.createOrder(userActor, createDto)).rejects.toThrow(BadRequestException);
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

      await expect(service.createOrder(userActor, createDto)).rejects.toThrow(ForbiddenException);
      expect(orderRepositoryMock.createFromCart).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the user no longer exists', async () => {
      userRepositoryMock.findById.mockResolvedValue(null);
      cartRepositoryMock.findByUserId.mockResolvedValue(cartWithItems);

      await expect(service.createOrder(userActor, createDto)).rejects.toThrow(ForbiddenException);
      expect(orderRepositoryMock.createFromCart).not.toHaveBeenCalled();
    });

    it('checks the user before touching the cart (no inventory work for a banned user)', async () => {
      userRepositoryMock.findById.mockResolvedValue(bannedUser);
      cartRepositoryMock.findByUserId.mockResolvedValue(cartWithItems);

      await expect(service.createOrder(userActor, createDto)).rejects.toThrow(ForbiddenException);
      expect(cartRepositoryMock.findByUserId).not.toHaveBeenCalled();
    });

    it('fetches the user exactly once on the happy path (reused for the email)', async () => {
      userRepositoryMock.findById.mockResolvedValue(recipient);
      cartRepositoryMock.findByUserId.mockResolvedValue(cartWithItems);
      orderRepositoryMock.createFromCart.mockResolvedValue(makeOrder());

      await service.createOrder(userActor, createDto);

      expect(userRepositoryMock.findById).toHaveBeenCalledTimes(1);
      expect(userRepositoryMock.findById).toHaveBeenCalledWith(USER_ID);
    });
  });

  // ─── createOrder → outbox enqueue (transactional outbox, TASK-103-F) ────────
  // The confirmation email is no longer sent synchronously; it is enqueued into
  // the mail outbox INSIDE the order's transaction (the repository drives the
  // afterCreate hook). A background worker dispatches it later.

  // ─── Add-on snapshotting at order creation (TASK-174, plan 150 case 25) ─────

  describe('createOrder — add-on snapshots', () => {
    const warranty = {
      addonServiceId: 'svc-warranty',
      name: 'Warranty',
      description: null,
      price: '499.00',
      source: 'template' as const,
    };

    /** Cart whose FIRST line has one selected add-on. */
    const cartWithSelectedAddon: CartWithItems = {
      ...cartWithItems,
      items: [
        { ...cartWithItems.items[0], addons: [{ addonServiceId: 'svc-warranty' }] },
        cartWithItems.items[1],
      ],
    };

    it('re-resolves add-ons FRESH at order creation (one batched call) and freezes the effective price', async () => {
      cartRepositoryMock.findByUserId.mockResolvedValue(cartWithSelectedAddon);
      orderRepositoryMock.createFromCart.mockResolvedValue(makeOrder());
      // The resolver reports an OVERRIDDEN price — that, not the catalog price,
      // is what must be frozen.
      addonResolverMock.resolveForProducts.mockResolvedValue(
        new Map([['product-uuid-1', [{ ...warranty, price: '399.00', source: 'override' }]]]),
      );

      await service.createOrder(userActor, createDto);

      expect(addonResolverMock.resolveForProducts).toHaveBeenCalledTimes(1);
      expect(orderRepositoryMock.createFromCart).toHaveBeenCalledWith(
        expect.objectContaining({
          addonsByCartItemId: new Map([
            [
              'cart-item-1',
              [{ addonServiceId: 'svc-warranty', name: 'Warranty', price: '399.00' }],
            ],
          ]),
        }),
        expect.any(Function),
      );
    });

    it('case 25 — silently DROPS a selection the resolver no longer returns (never throws)', async () => {
      cartRepositoryMock.findByUserId.mockResolvedValue(cartWithSelectedAddon);
      orderRepositoryMock.createFromCart.mockResolvedValue(makeOrder());
      // The service was deactivated / the template changed since add-to-cart.
      addonResolverMock.resolveForProducts.mockResolvedValue(new Map([['product-uuid-1', []]]));

      await expect(service.createOrder(userActor, createDto)).resolves.toBeInstanceOf(OrderEntity);

      expect(orderRepositoryMock.createFromCart).toHaveBeenCalledWith(
        expect.objectContaining({ addonsByCartItemId: new Map() }),
        expect.any(Function),
      );
      expect(pinoLoggerMock.warn).toHaveBeenCalled();
    });
  });

  describe('createOrder — outbox enqueue', () => {
    beforeEach(() => {
      cartRepositoryMock.findByUserId.mockResolvedValue(cartWithItems);
      resolveCreateWithHook();
    });

    it('enqueues an order-confirmation outbox row for the recipient in the transaction', async () => {
      userRepositoryMock.findById.mockResolvedValue(recipient);

      const result = await service.createOrder(userActor, createDto);

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

      await service.createOrder(userActor, createDto);

      // OrderService no longer depends on MailService at all — the only mail
      // interaction is the outbox enqueue above.
      expect(mailOutboxServiceMock.enqueueOrderConfirmation).toHaveBeenCalledTimes(1);
    });

    it('reuses the guard-fetched user for the enqueue (no second lookup)', async () => {
      userRepositoryMock.findById.mockResolvedValue(recipient);

      await service.createOrder(userActor, createDto);

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

      // TASK-251: the customer is the actor for their own self-cancel.
      expect(orderRepositoryMock.cancelAndRestock).toHaveBeenCalledWith('order-uuid-1', USER_ID);
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

      const result = await service.updateStatus('order-uuid-1', OrderStatus.CONFIRMED, ADMIN_ID);

      // TASK-151: paymentStatus is forwarded unchanged (PENDING), not auto-derived.
      // TASK-251: the 2nd arg is now the fromStatus (current status), the 3rd the
      // target, the 5th the acting admin's changedBy, the 6th the TASK-254
      // eviction options (asserted in its own block below).
      expect(orderRepositoryMock.updateStatus).toHaveBeenCalledWith(
        'order-uuid-1',
        OrderStatus.PENDING,
        OrderStatus.CONFIRMED,
        PaymentStatus.PENDING,
        ADMIN_ID,
        expect.anything(),
      );
      expect(result.status).toBe(OrderStatus.CONFIRMED);
    });

    it('should throw NotFoundException when the order does not exist', async () => {
      orderRepositoryMock.findById.mockResolvedValue(null);

      await expect(
        service.updateStatus('missing', OrderStatus.CONFIRMED, ADMIN_ID),
      ).rejects.toThrow(NotFoundException);
      expect(orderRepositoryMock.updateStatus).not.toHaveBeenCalled();
    });
  });

  // ─── updateStatus — the state machine (TASK-332) ─────────────────────────────
  // Until now this endpoint wrote whatever status it was handed. The table in
  // order-state-machine.ts is unit-tested on its own; what matters HERE is that
  // the service consults it, refuses with a 409 carrying a stable code, and —
  // the part that actually protects the audit trail — writes nothing at all when
  // it refuses.

  describe('updateStatus — transition validation', () => {
    const seed = (current: Partial<OrderWithItems>) => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder(current));
    };

    it.each([
      [OrderStatus.DELIVERED, OrderStatus.SHIPPED, 'a backward move'],
      [OrderStatus.SHIPPED, OrderStatus.PENDING, 'a rewind to the start'],
      [OrderStatus.PENDING, OrderStatus.REFUNDED, 'refunding money that never moved'],
      [OrderStatus.REFUNDED, OrderStatus.PROCESSING, 'resurrecting a refunded order'],
    ])('rejects %s → %s (%s) with a 409', async (from, to) => {
      seed({ status: from, paymentStatus: PaymentStatus.PAID });

      await expect(service.updateStatus('order-uuid-1', to, ADMIN_ID)).rejects.toThrow(
        ConflictException,
      );
    });

    it('carries the stable ORDER_TRANSITION_INVALID code and names both ends', async () => {
      seed({ status: OrderStatus.DELIVERED, paymentStatus: PaymentStatus.PAID });

      await expect(
        service.updateStatus('order-uuid-1', OrderStatus.SHIPPED, ADMIN_ID),
      ).rejects.toMatchObject({
        response: {
          error: 'ORDER_TRANSITION_INVALID',
          message: expect.stringContaining('DELIVERED'),
        },
      });
    });

    it('writes NOTHING when it refuses — no status write, no restock, no revive', async () => {
      seed({ status: OrderStatus.DELIVERED, paymentStatus: PaymentStatus.PAID });

      await expect(
        service.updateStatus('order-uuid-1', OrderStatus.PROCESSING, ADMIN_ID),
      ).rejects.toThrow(ConflictException);

      expect(orderRepositoryMock.updateStatus).not.toHaveBeenCalled();
      expect(orderRepositoryMock.cancelAndRestock).not.toHaveBeenCalled();
      expect(orderRepositoryMock.reviveAndReserve).not.toHaveBeenCalled();
    });

    it('404s before it judges the transition when the order does not exist', async () => {
      orderRepositoryMock.findById.mockResolvedValue(null);

      // Not a 409: "you cannot do that to this order" is misleading when there is
      // no such order in the first place.
      await expect(service.updateStatus('missing', OrderStatus.SHIPPED, ADMIN_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── updateStatus — optimistic locking (TASK-332, edge case E-11) ────────────
  // Two admins with the same order open used to produce last-write-wins plus two
  // history rows describing changes only one of which survived.

  describe('updateStatus — optimistic locking', () => {
    const loadedAt = new Date('2026-07-28T10:15:30.000Z');

    const seed = (updatedAt: Date) => {
      orderRepositoryMock.findById.mockResolvedValue(
        makeOrder({ status: OrderStatus.PENDING, updatedAt }),
      );
      orderRepositoryMock.updateStatus.mockImplementation(
        (_id: string, _from: OrderStatus, status: OrderStatus, paymentStatus: PaymentStatus) =>
          Promise.resolve(makeOrder({ status, paymentStatus })),
      );
    };

    it('proceeds when the caller version matches the stored row', async () => {
      seed(loadedAt);

      await service.updateStatus('order-uuid-1', OrderStatus.CONFIRMED, ADMIN_ID, {
        expectedUpdatedAt: new Date(loadedAt),
      });

      expect(orderRepositoryMock.updateStatus).toHaveBeenCalledWith(
        'order-uuid-1',
        OrderStatus.PENDING,
        OrderStatus.CONFIRMED,
        PaymentStatus.PENDING,
        ADMIN_ID,
        // The same token is threaded down so the repository's conditional write —
        // not this comparison — is the arbiter under real concurrency.
        expect.objectContaining({ expectedUpdatedAt: new Date(loadedAt) }),
      );
    });

    it('rejects with ORDER_STALE when the order moved on underneath the caller', async () => {
      seed(new Date('2026-07-28T10:20:00.000Z'));

      await expect(
        service.updateStatus('order-uuid-1', OrderStatus.CONFIRMED, ADMIN_ID, {
          expectedUpdatedAt: loadedAt,
        }),
      ).rejects.toMatchObject({ response: { error: 'ORDER_STALE' } });

      expect(orderRepositoryMock.updateStatus).not.toHaveBeenCalled();
    });

    it('checks staleness BEFORE the transition, so the operator is told the useful thing', async () => {
      // The stored order has advanced to DELIVERED; the caller still believes it is
      // PENDING and asks for CONFIRMED. Both gates would fire. Reporting "cannot go
      // DELIVERED → CONFIRMED" would describe a starting point the operator never
      // saw; "reload, it changed" is the fact they can act on.
      seed(new Date('2026-07-28T10:20:00.000Z'));
      orderRepositoryMock.findById.mockResolvedValue(
        makeOrder({ status: OrderStatus.DELIVERED, updatedAt: new Date('2026-07-28T10:20:00Z') }),
      );

      await expect(
        service.updateStatus('order-uuid-1', OrderStatus.CONFIRMED, ADMIN_ID, {
          expectedUpdatedAt: loadedAt,
        }),
      ).rejects.toMatchObject({ response: { error: 'ORDER_STALE' } });
    });

    it('skips the check entirely for system callers that declare no version', async () => {
      seed(loadedAt);

      await service.updateStatus('order-uuid-1', OrderStatus.CONFIRMED, null);

      expect(orderRepositoryMock.updateStatus).toHaveBeenCalled();
    });
  });

  // ─── getAllowedTransitions (TASK-332) ────────────────────────────────────────

  describe('getAllowedTransitions', () => {
    it('returns the current status, its legal targets, and the lock token', async () => {
      const updatedAt = new Date('2026-07-28T10:15:30.000Z');
      orderRepositoryMock.findById.mockResolvedValue(
        makeOrder({ status: OrderStatus.PROCESSING, updatedAt }),
      );

      const result = await service.getAllowedTransitions('order-uuid-1');

      expect(result.current).toBe(OrderStatus.PROCESSING);
      expect(result.allowed).toEqual([
        OrderStatus.SHIPPED,
        OrderStatus.DELIVERED,
        OrderStatus.CANCELLED,
      ]);
      expect(result.updatedAt).toEqual(updatedAt);
    });

    it('never offers the current status back (that write would be a no-op)', async () => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder({ status: OrderStatus.SHIPPED }));

      const result = await service.getAllowedTransitions('order-uuid-1');

      expect(result.allowed).not.toContain(OrderStatus.SHIPPED);
    });

    it('returns an empty-but-not-broken set for the most terminal status', async () => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder({ status: OrderStatus.REFUNDED }));

      const result = await service.getAllowedTransitions('order-uuid-1');

      expect(result.allowed).toEqual([OrderStatus.CANCELLED]);
    });

    it('throws NotFoundException when the order does not exist', async () => {
      orderRepositoryMock.findById.mockResolvedValue(null);

      await expect(service.getAllowedTransitions('missing')).rejects.toThrow(NotFoundException);
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
        (_id: string, _from: OrderStatus, status: OrderStatus, paymentStatus: PaymentStatus) =>
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

      const result = await service.updateStatus('order-uuid-1', status, ADMIN_ID);

      expect(orderRepositoryMock.updateStatus).toHaveBeenCalledWith(
        'order-uuid-1',
        OrderStatus.PENDING,
        status,
        PaymentStatus.PENDING,
        ADMIN_ID,
        expect.anything(),
      );
      expect(result.paymentStatus).toBe(PaymentStatus.PENDING);
    });

    it('does NOT auto-set REFUNDED when an order is moved to REFUNDED (payment preserved)', async () => {
      seedAndEcho({ status: OrderStatus.DELIVERED, paymentStatus: PaymentStatus.PAID });

      await service.updateStatus('order-uuid-1', OrderStatus.REFUNDED, ADMIN_ID);

      expect(orderRepositoryMock.updateStatus).toHaveBeenCalledWith(
        'order-uuid-1',
        OrderStatus.DELIVERED,
        OrderStatus.REFUNDED,
        PaymentStatus.PAID,
        ADMIN_ID,
        expect.anything(),
      );
    });

    it('leaves an already-PAID order PAID when advanced further', async () => {
      seedAndEcho({ status: OrderStatus.PROCESSING, paymentStatus: PaymentStatus.PAID });

      await service.updateStatus('order-uuid-1', OrderStatus.DELIVERED, ADMIN_ID);

      expect(orderRepositoryMock.updateStatus).toHaveBeenCalledWith(
        'order-uuid-1',
        OrderStatus.PROCESSING,
        OrderStatus.DELIVERED,
        PaymentStatus.PAID,
        ADMIN_ID,
        expect.anything(),
      );
    });
  });

  // ─── updateStatus — product cache eviction on pre-shipment boundary (TASK-254) ─
  // A plain status transition that crosses the pre-shipment boundary changes the
  // affected products' DERIVED reservedQty/physicalQty (via getReservedQtyByProductId)
  // without touching `stock`, so the cached admin ProductEntity (findById) must be
  // evicted. The service tells the repository whether to evict via the 4th arg.

  describe('updateStatus — product cache eviction on pre-shipment boundary (TASK-254)', () => {
    const seedAndEcho = (current: Partial<OrderWithItems>) => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder(current));
      orderRepositoryMock.updateStatus.mockImplementation(
        (_id: string, _from: OrderStatus, status: OrderStatus, paymentStatus: PaymentStatus) =>
          Promise.resolve(makeOrder({ status, paymentStatus })),
      );
    };

    it('evicts product caches when leaving pre-shipment (PROCESSING → SHIPPED)', async () => {
      seedAndEcho({ status: OrderStatus.PROCESSING, paymentStatus: PaymentStatus.PAID });

      await service.updateStatus('order-uuid-1', OrderStatus.SHIPPED, ADMIN_ID);

      expect(orderRepositoryMock.updateStatus).toHaveBeenCalledWith(
        'order-uuid-1',
        OrderStatus.PROCESSING,
        OrderStatus.SHIPPED,
        PaymentStatus.PAID,
        ADMIN_ID,
        { evictProductStockCaches: true },
      );
    });

    it('evicts product caches when leaving pre-shipment (CONFIRMED → DELIVERED)', async () => {
      seedAndEcho({ status: OrderStatus.CONFIRMED, paymentStatus: PaymentStatus.PAID });

      await service.updateStatus('order-uuid-1', OrderStatus.DELIVERED, ADMIN_ID);

      expect(orderRepositoryMock.updateStatus).toHaveBeenCalledWith(
        'order-uuid-1',
        OrderStatus.CONFIRMED,
        OrderStatus.DELIVERED,
        PaymentStatus.PAID,
        ADMIN_ID,
        { evictProductStockCaches: true },
      );
    });

    it('evicts product caches when re-entering pre-shipment (CANCELLED → PROCESSING)', async () => {
      // A never-restocked cancelled order (restockedAt null) moved back into a
      // live pre-shipment status takes the plain updateStatus path (not revive).
      seedAndEcho({
        status: OrderStatus.CANCELLED,
        paymentStatus: PaymentStatus.PENDING,
        restockedAt: null,
      });

      await service.updateStatus('order-uuid-1', OrderStatus.PROCESSING, ADMIN_ID);

      expect(orderRepositoryMock.updateStatus).toHaveBeenCalledWith(
        'order-uuid-1',
        OrderStatus.CANCELLED,
        OrderStatus.PROCESSING,
        PaymentStatus.PENDING,
        ADMIN_ID,
        { evictProductStockCaches: true },
      );
    });

    it('does NOT evict when staying within pre-shipment (PENDING → CONFIRMED)', async () => {
      seedAndEcho({ status: OrderStatus.PENDING, paymentStatus: PaymentStatus.PENDING });

      await service.updateStatus('order-uuid-1', OrderStatus.CONFIRMED, ADMIN_ID);

      expect(orderRepositoryMock.updateStatus).toHaveBeenCalledWith(
        'order-uuid-1',
        OrderStatus.PENDING,
        OrderStatus.CONFIRMED,
        PaymentStatus.PENDING,
        ADMIN_ID,
        { evictProductStockCaches: false },
      );
    });

    it('does NOT evict when staying post-shipment (SHIPPED → DELIVERED)', async () => {
      seedAndEcho({ status: OrderStatus.SHIPPED, paymentStatus: PaymentStatus.PAID });

      await service.updateStatus('order-uuid-1', OrderStatus.DELIVERED, ADMIN_ID);

      expect(orderRepositoryMock.updateStatus).toHaveBeenCalledWith(
        'order-uuid-1',
        OrderStatus.SHIPPED,
        OrderStatus.DELIVERED,
        PaymentStatus.PAID,
        ADMIN_ID,
        { evictProductStockCaches: false },
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

      const result = await service.adminUpdatePaymentStatus(
        'order-uuid-1',
        PaymentStatus.PAID,
        ADMIN_ID,
      );

      expect(orderRepositoryMock.updatePaymentStatus).toHaveBeenCalledWith(
        'order-uuid-1',
        PaymentStatus.PAID,
        ADMIN_ID,
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

      const result = await service.adminUpdatePaymentStatus(
        'order-uuid-1',
        PaymentStatus.REFUNDED,
        ADMIN_ID,
      );

      expect(orderRepositoryMock.updatePaymentStatus).toHaveBeenCalledWith(
        'order-uuid-1',
        PaymentStatus.REFUNDED,
        ADMIN_ID,
      );
      expect(result.status).toBe(OrderStatus.DELIVERED);
      expect(result.paymentStatus).toBe(PaymentStatus.REFUNDED);
    });

    it('throws NotFoundException when the order does not exist', async () => {
      orderRepositoryMock.findById.mockResolvedValue(null);

      await expect(
        service.adminUpdatePaymentStatus('missing', PaymentStatus.PAID, ADMIN_ID),
      ).rejects.toThrow(NotFoundException);
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
        (_id: string, _from: OrderStatus, status: OrderStatus, paymentStatus: PaymentStatus) =>
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

        const result = await service.updateStatus('order-uuid-1', OrderStatus.CANCELLED, ADMIN_ID);

        // TASK-251: the acting admin is threaded as changedBy into the restock path.
        // TASK-332: the (here absent) optimistic-lock token rides along as the 3rd arg.
        expect(orderRepositoryMock.cancelAndRestock).toHaveBeenCalledWith(
          'order-uuid-1',
          ADMIN_ID,
          expect.anything(),
        );
        expect(orderRepositoryMock.updateStatus).not.toHaveBeenCalled();
        expect(result.status).toBe(OrderStatus.CANCELLED);
      },
    );

    it('preserves paymentStatus PAID on a paid pre-shipment cancel (refund is a separate step)', async () => {
      seed({ status: OrderStatus.CONFIRMED, paymentStatus: PaymentStatus.PAID });
      orderRepositoryMock.cancelAndRestock.mockResolvedValue(
        makeOrder({ status: OrderStatus.CANCELLED, paymentStatus: PaymentStatus.PAID }),
      );

      const result = await service.updateStatus('order-uuid-1', OrderStatus.CANCELLED, ADMIN_ID);

      expect(result.paymentStatus).toBe(PaymentStatus.PAID);
    });

    // ── Manual restock: post-shipment cancels / refunds do NOT auto-restock ──
    it.each([OrderStatus.SHIPPED, OrderStatus.DELIVERED])(
      'does NOT auto-restock when cancelling a post-shipment order (%s → CANCELLED, manual return)',
      async (from) => {
        seed({ status: from, paymentStatus: PaymentStatus.PAID });

        await service.updateStatus('order-uuid-1', OrderStatus.CANCELLED, ADMIN_ID);

        expect(orderRepositoryMock.cancelAndRestock).not.toHaveBeenCalled();
        expect(orderRepositoryMock.updateStatus).toHaveBeenCalledWith(
          'order-uuid-1',
          from,
          OrderStatus.CANCELLED,
          PaymentStatus.PAID,
          ADMIN_ID,
          expect.anything(),
        );
      },
    );

    it('does NOT auto-restock when refunding a delivered order (manual return required)', async () => {
      seed({ status: OrderStatus.DELIVERED, paymentStatus: PaymentStatus.PAID });

      await service.updateStatus('order-uuid-1', OrderStatus.REFUNDED, ADMIN_ID);

      expect(orderRepositoryMock.cancelAndRestock).not.toHaveBeenCalled();
      // TASK-151: paymentStatus is preserved (PAID), not auto-set to REFUNDED.
      // The admin sets payment status separately via adminUpdatePaymentStatus.
      expect(orderRepositoryMock.updateStatus).toHaveBeenCalledWith(
        'order-uuid-1',
        OrderStatus.DELIVERED,
        OrderStatus.REFUNDED,
        PaymentStatus.PAID,
        ADMIN_ID,
        expect.anything(),
      );
    });

    // TASK-332 supersedes the old "CANCELLED → CANCELLED is a harmless no-op"
    // behaviour: the state machine refuses a status writing over itself, so the
    // double credit is now impossible one step earlier — the request never
    // reaches a repository at all, and no history row is appended for a change
    // that did not happen.
    it('refuses to re-cancel an already-CANCELLED order (409) and touches no repository', async () => {
      seed({ status: OrderStatus.CANCELLED, paymentStatus: PaymentStatus.PAID });

      await expect(
        service.updateStatus('order-uuid-1', OrderStatus.CANCELLED, ADMIN_ID),
      ).rejects.toThrow(ConflictException);

      expect(orderRepositoryMock.cancelAndRestock).not.toHaveBeenCalled();
      expect(orderRepositoryMock.updateStatus).not.toHaveBeenCalled();
    });

    it('does NOT restock on a forward transition (PENDING → CONFIRMED)', async () => {
      seed({ status: OrderStatus.PENDING, paymentStatus: PaymentStatus.PENDING });

      await service.updateStatus('order-uuid-1', OrderStatus.CONFIRMED, ADMIN_ID);

      expect(orderRepositoryMock.cancelAndRestock).not.toHaveBeenCalled();
    });

    it('throws NotFoundException and restocks nothing when the order does not exist', async () => {
      orderRepositoryMock.findById.mockResolvedValue(null);

      await expect(
        service.updateStatus('missing', OrderStatus.CANCELLED, ADMIN_ID),
      ).rejects.toThrow(NotFoundException);
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
        (_id: string, _from: OrderStatus, status: OrderStatus, paymentStatus: PaymentStatus) =>
          Promise.resolve(makeOrder({ ...current, status, paymentStatus })),
      );
      orderRepositoryMock.cancelAndRestock.mockImplementation((_id: string) =>
        Promise.resolve(makeOrder({ ...current, status: OrderStatus.CANCELLED, restockedAt })),
      );
    };

    // TASK-332 narrows the revive targets to the pre-shipment statuses — the ones
    // whose stock this path re-reserves. CANCELLED → SHIPPED/DELIVERED is refused
    // (see the case below): it would assert a parcel left the building in the same
    // breath as re-reserving the stock that parcel supposedly contains.
    it.each([OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PROCESSING])(
      're-reserves stock when reviving a restocked CANCELLED order (CANCELLED → %s)',
      async (to) => {
        seed({ status: OrderStatus.CANCELLED, paymentStatus: PaymentStatus.PAID, restockedAt });

        const result = await service.updateStatus('order-uuid-1', to, ADMIN_ID);

        // TASK-251: changedBy is threaded into the revive path as the 4th arg.
        // TASK-332: the optimistic-lock token follows as the 5th.
        expect(orderRepositoryMock.reviveAndReserve).toHaveBeenCalledWith(
          'order-uuid-1',
          to,
          PaymentStatus.PAID,
          ADMIN_ID,
          expect.anything(),
        );
        expect(orderRepositoryMock.updateStatus).not.toHaveBeenCalled();
        expect(orderRepositoryMock.cancelAndRestock).not.toHaveBeenCalled();
        expect(result.status).toBe(to);
      },
    );

    it.each([OrderStatus.SHIPPED, OrderStatus.DELIVERED])(
      'refuses to revive a CANCELLED order straight into %s (409, no stock touched)',
      async (to) => {
        seed({ status: OrderStatus.CANCELLED, paymentStatus: PaymentStatus.PAID, restockedAt });

        await expect(service.updateStatus('order-uuid-1', to, ADMIN_ID)).rejects.toThrow(
          ConflictException,
        );

        expect(orderRepositoryMock.reviveAndReserve).not.toHaveBeenCalled();
        expect(orderRepositoryMock.updateStatus).not.toHaveBeenCalled();
        expect(orderRepositoryMock.cancelAndRestock).not.toHaveBeenCalled();
      },
    );

    it('keeps the flag and touches no stock when moving a restocked CANCELLED order to REFUNDED', async () => {
      seed({ status: OrderStatus.CANCELLED, paymentStatus: PaymentStatus.PAID, restockedAt });

      await service.updateStatus('order-uuid-1', OrderStatus.REFUNDED, ADMIN_ID);

      expect(orderRepositoryMock.reviveAndReserve).not.toHaveBeenCalled();
      expect(orderRepositoryMock.cancelAndRestock).not.toHaveBeenCalled();
      expect(orderRepositoryMock.updateStatus).toHaveBeenCalledWith(
        'order-uuid-1',
        OrderStatus.CANCELLED,
        OrderStatus.REFUNDED,
        PaymentStatus.PAID,
        ADMIN_ID,
        expect.anything(),
      );
    });

    // TASK-332: REFUNDED is terminal but for its twin. The money is already back
    // with the customer, so pulling the order into a live status would be a
    // bookkeeping fiction — the operator's honest move is a NEW order. Only
    // REFUNDED → CANCELLED remains, and that touches no stock.
    it('refuses to revive a restocked REFUNDED order into a live status (409, no stock touched)', async () => {
      seed({ status: OrderStatus.REFUNDED, paymentStatus: PaymentStatus.REFUNDED, restockedAt });

      await expect(
        service.updateStatus('order-uuid-1', OrderStatus.PENDING, ADMIN_ID),
      ).rejects.toThrow(ConflictException);

      expect(orderRepositoryMock.reviveAndReserve).not.toHaveBeenCalled();
      expect(orderRepositoryMock.updateStatus).not.toHaveBeenCalled();
    });

    it('does NOT reserve when reviving a post-shipment-cancelled order (its stock was never credited back)', async () => {
      seed({ status: OrderStatus.CANCELLED, paymentStatus: PaymentStatus.PAID, restockedAt: null });

      await service.updateStatus('order-uuid-1', OrderStatus.PENDING, ADMIN_ID);

      expect(orderRepositoryMock.reviveAndReserve).not.toHaveBeenCalled();
      expect(orderRepositoryMock.updateStatus).toHaveBeenCalledWith(
        'order-uuid-1',
        OrderStatus.CANCELLED,
        OrderStatus.PENDING,
        PaymentStatus.PAID,
        ADMIN_ID,
        expect.anything(),
      );
    });

    it('propagates the 409 from the repository and leaves the order terminal when stock is gone', async () => {
      seed({ status: OrderStatus.CANCELLED, paymentStatus: PaymentStatus.PAID, restockedAt });
      orderRepositoryMock.reviveAndReserve.mockRejectedValue(
        new ConflictException(
          'Insufficient stock for "iPhone 15 Pro Case" — cannot revive the order',
        ),
      );

      await expect(
        service.updateStatus('order-uuid-1', OrderStatus.PENDING, ADMIN_ID),
      ).rejects.toThrow(ConflictException);
      expect(orderRepositoryMock.updateStatus).not.toHaveBeenCalled();
      expect(orderRepositoryMock.cancelAndRestock).not.toHaveBeenCalled();
    });

    it('belt-and-braces: does NOT restock a live order whose flag is somehow still set (no double credit)', async () => {
      // Anomalous state (only reachable by edits outside the service): a live
      // PENDING order with restockedAt set. Cancelling it must NOT credit stock.
      seed({ status: OrderStatus.PENDING, paymentStatus: PaymentStatus.PENDING, restockedAt });

      await service.updateStatus('order-uuid-1', OrderStatus.CANCELLED, ADMIN_ID);

      expect(orderRepositoryMock.cancelAndRestock).not.toHaveBeenCalled();
      expect(orderRepositoryMock.updateStatus).toHaveBeenCalledWith(
        'order-uuid-1',
        OrderStatus.PENDING,
        OrderStatus.CANCELLED,
        PaymentStatus.PENDING,
        ADMIN_ID,
        expect.anything(),
      );
    });
  });

  // ─── Operator-created orders (TASK-341) ──────────────────────────────────────
  // A phone order. The shop still sells at its own price, and the operator is
  // not a reason to oversell.

  describe('adminCreateOrder', () => {
    const catalogueProduct = {
      id: 'product-uuid-1',
      name: 'iPhone 15 Pro Case',
      price: { toString: () => '499.00' },
      stock: 10,
      isActive: true,
      category: { isActive: true },
    };

    const dto = {
      contact: guestContact,
      shippingAddress: address,
      items: [{ productId: 'product-uuid-1', quantity: 2 }],
    };

    beforeEach(() => {
      orderRepositoryMock.findOrderableProducts.mockResolvedValue([catalogueProduct]);
      orderRepositoryMock.createManual.mockResolvedValue(makeOrder());
    });

    it('prices the order from the catalogue, never from the request', async () => {
      await service.adminCreateOrder(dto, ADMIN_ID);

      expect(orderRepositoryMock.createManual).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [
            expect.objectContaining({ productId: 'product-uuid-1', quantity: 2, price: '499.00' }),
          ],
        }),
        ADMIN_ID,
      );
    });

    it('records the acting operator on the order', async () => {
      await service.adminCreateOrder(dto, ADMIN_ID);

      // Unlike a self-service order this one HAS an acting user, and recording
      // them is the point of auditing manual orders.
      expect(orderRepositoryMock.createManual).toHaveBeenCalledWith(expect.anything(), ADMIN_ID);
    });

    it('requires either an account or contact details', async () => {
      await expect(
        service.adminCreateOrder({ shippingAddress: address, items: dto.items }, ADMIN_ID),
      ).rejects.toThrow(BadRequestException);

      expect(orderRepositoryMock.createManual).not.toHaveBeenCalled();
    });

    it('creates against an existing account when one is named', async () => {
      userRepositoryMock.findById.mockResolvedValue(recipient);

      await service.adminCreateOrder({ ...dto, contact: undefined, userId: USER_ID }, ADMIN_ID);

      expect(orderRepositoryMock.createManual).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER_ID }),
        ADMIN_ID,
      );
    });

    it('refuses to place an order for a deactivated account', async () => {
      userRepositoryMock.findById.mockResolvedValue(bannedUser);

      await expect(
        service.adminCreateOrder({ ...dto, contact: undefined, userId: USER_ID }, ADMIN_ID),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuses a product that has been withdrawn from sale', async () => {
      orderRepositoryMock.findOrderableProducts.mockResolvedValue([
        { ...catalogueProduct, isActive: false },
      ]);

      await expect(service.adminCreateOrder(dto, ADMIN_ID)).rejects.toThrow(BadRequestException);
      expect(orderRepositoryMock.createManual).not.toHaveBeenCalled();
    });

    it('refuses a product whose category has been withdrawn from sale', async () => {
      orderRepositoryMock.findOrderableProducts.mockResolvedValue([
        { ...catalogueProduct, category: { isActive: false } },
      ]);

      await expect(service.adminCreateOrder(dto, ADMIN_ID)).rejects.toThrow(BadRequestException);
    });

    it('refuses to oversell — an operator is not an exemption', async () => {
      orderRepositoryMock.findOrderableProducts.mockResolvedValue([
        { ...catalogueProduct, stock: 1 },
      ]);

      await expect(service.adminCreateOrder(dto, ADMIN_ID)).rejects.toThrow(BadRequestException);
      expect(orderRepositoryMock.createManual).not.toHaveBeenCalled();
    });

    it('refuses a product id that is not in the catalogue', async () => {
      orderRepositoryMock.findOrderableProducts.mockResolvedValue([]);

      await expect(service.adminCreateOrder(dto, ADMIN_ID)).rejects.toThrow(BadRequestException);
    });

    it('returns the operator-only fields on the response', async () => {
      orderRepositoryMock.createManual.mockResolvedValue(
        makeOrder({ internalNotes: 'Paid cash at the counter' }),
      );

      const result = await service.adminCreateOrder(
        { ...dto, internalNotes: 'Paid cash at the counter' },
        ADMIN_ID,
      );

      expect(result.internalNotes).toBe('Paid cash at the counter');
    });
  });

  // ─── Pre-shipment address correction (TASK-341) ──────────────────────────────

  describe('adminUpdateShippingAddress', () => {
    const newAddress = { ...address, city: 'Львів' };

    beforeEach(() => {
      orderRepositoryMock.updateShippingAddress.mockResolvedValue(makeOrder());
    });

    it.each([OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PROCESSING])(
      'corrects the address while the order is still %s',
      async (status) => {
        orderRepositoryMock.findById.mockResolvedValue(makeOrder({ status }));

        await service.adminUpdateShippingAddress('order-uuid-1', newAddress);

        expect(orderRepositoryMock.updateShippingAddress).toHaveBeenCalledWith(
          'order-uuid-1',
          newAddress,
          expect.anything(),
        );
      },
    );

    it.each([OrderStatus.SHIPPED, OrderStatus.DELIVERED])(
      'refuses once the parcel is with the courier (%s)',
      async (status) => {
        orderRepositoryMock.findById.mockResolvedValue(makeOrder({ status }));

        // Editing the order would not move the parcel — it would only make the
        // record disagree with reality, and the record is what support reads.
        await expect(
          service.adminUpdateShippingAddress('order-uuid-1', newAddress),
        ).rejects.toThrow(ConflictException);
        expect(orderRepositoryMock.updateShippingAddress).not.toHaveBeenCalled();
      },
    );

    it('rejects a stale edit before touching the address', async () => {
      orderRepositoryMock.findById.mockResolvedValue(
        makeOrder({ status: OrderStatus.PENDING, updatedAt: new Date('2026-07-28T10:20:00.000Z') }),
      );

      await expect(
        service.adminUpdateShippingAddress('order-uuid-1', newAddress, {
          expectedUpdatedAt: new Date('2026-07-28T10:15:30.000Z'),
        }),
      ).rejects.toMatchObject({ response: { error: 'ORDER_STALE' } });

      expect(orderRepositoryMock.updateShippingAddress).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the order does not exist', async () => {
      orderRepositoryMock.findById.mockResolvedValue(null);

      await expect(service.adminUpdateShippingAddress('missing', newAddress)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── Tracking number + shipment notice (TASK-335) ────────────────────────────
  // Until now a parcel left the warehouse and the customer found out by
  // refreshing the site, if they thought to.

  describe('shipment notice', () => {
    const seedShipped = (current: Partial<OrderWithItems>, updated: Partial<OrderWithItems>) => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder(current));
      orderRepositoryMock.updateStatus.mockResolvedValue(makeOrder(updated));
      orderRepositoryMock.findRecipient.mockResolvedValue({
        email: 'buyer@example.com',
        name: 'Olena',
      });
    };

    it('enqueues the notice when the order reaches SHIPPED, with the waybill', async () => {
      seedShipped(
        { status: OrderStatus.PROCESSING },
        { status: OrderStatus.SHIPPED, trackingNumber: '20450000000001' },
      );

      await service.updateStatus('order-uuid-1', OrderStatus.SHIPPED, ADMIN_ID);

      expect(mailOutboxServiceMock.enqueueOrderShipped).toHaveBeenCalledWith({
        to: 'buyer@example.com',
        customerName: 'Olena',
        order: { id: 'order-uuid-1', trackingNumber: '20450000000001' },
      });
    });

    it('still tells the customer when no waybill has been entered yet', async () => {
      seedShipped(
        { status: OrderStatus.PROCESSING },
        { status: OrderStatus.SHIPPED, trackingNumber: null },
      );

      await service.updateStatus('order-uuid-1', OrderStatus.SHIPPED, ADMIN_ID);

      // "On its way" with no number still beats silence.
      expect(mailOutboxServiceMock.enqueueOrderShipped).toHaveBeenCalledWith(
        expect.objectContaining({ order: { id: 'order-uuid-1', trackingNumber: null } }),
      );
    });

    it('sends nothing on a transition that is not a shipment', async () => {
      seedShipped({ status: OrderStatus.PENDING }, { status: OrderStatus.CONFIRMED });

      await service.updateStatus('order-uuid-1', OrderStatus.CONFIRMED, ADMIN_ID);

      expect(mailOutboxServiceMock.enqueueOrderShipped).not.toHaveBeenCalled();
    });

    it('does NOT fail the status change when the notice cannot be enqueued', async () => {
      seedShipped({ status: OrderStatus.PROCESSING }, { status: OrderStatus.SHIPPED });
      mailOutboxServiceMock.enqueueOrderShipped.mockRejectedValue(new Error('outbox down'));

      // The parcel is physically gone. Failing the transition would leave the
      // operator retrying a move the state machine then refuses — stuck with a
      // shipped parcel and an order that says otherwise.
      await expect(
        service.updateStatus('order-uuid-1', OrderStatus.SHIPPED, ADMIN_ID),
      ).resolves.toBeInstanceOf(OrderEntity);
    });

    it('warns and sends nothing when the order has no email on file', async () => {
      seedShipped({ status: OrderStatus.PROCESSING }, { status: OrderStatus.SHIPPED });
      orderRepositoryMock.findRecipient.mockResolvedValue(null);

      await service.updateStatus('order-uuid-1', OrderStatus.SHIPPED, ADMIN_ID);

      expect(mailOutboxServiceMock.enqueueOrderShipped).not.toHaveBeenCalled();
      expect(pinoLoggerMock.warn).toHaveBeenCalled();
    });
  });

  // ─── adminUpdateDetails (TASK-335 / TASK-336) ────────────────────────────────

  describe('adminUpdateDetails', () => {
    const seed = (current: Partial<OrderWithItems>, updated: Partial<OrderWithItems> = {}) => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder(current));
      orderRepositoryMock.updateDetails.mockResolvedValue(makeOrder({ ...current, ...updated }));
      orderRepositoryMock.findRecipient.mockResolvedValue({ email: 'buyer@example.com' });
    };

    it('forwards only the fields the caller supplied', async () => {
      seed({ status: OrderStatus.PROCESSING });

      await service.adminUpdateDetails('order-uuid-1', { internalNotes: 'Call before dispatch' });

      expect(orderRepositoryMock.updateDetails).toHaveBeenCalledWith(
        'order-uuid-1',
        { internalNotes: 'Call before dispatch' },
        expect.anything(),
      );
    });

    it('exposes internalNotes on the response (this is the admin card)', async () => {
      seed({ status: OrderStatus.PROCESSING }, { internalNotes: 'Suspected fraud' });

      const result = await service.adminUpdateDetails('order-uuid-1', {
        internalNotes: 'Suspected fraud',
      });

      expect(result.internalNotes).toBe('Suspected fraud');
    });

    it('notifies the customer when a waybill first appears on an already-SHIPPED order', async () => {
      seed(
        { status: OrderStatus.SHIPPED, trackingNumber: null },
        { trackingNumber: '20450000000001' },
      );

      await service.adminUpdateDetails('order-uuid-1', { trackingNumber: '20450000000001' });

      expect(mailOutboxServiceMock.enqueueOrderShipped).toHaveBeenCalledWith(
        expect.objectContaining({
          order: { id: 'order-uuid-1', trackingNumber: '20450000000001' },
        }),
      );
    });

    it('does NOT re-notify when an existing waybill is corrected', async () => {
      seed(
        { status: OrderStatus.SHIPPED, trackingNumber: '20450000000000' },
        { trackingNumber: '20450000000001' },
      );

      await service.adminUpdateDetails('order-uuid-1', { trackingNumber: '20450000000001' });

      // Fixing a typo is not news.
      expect(mailOutboxServiceMock.enqueueOrderShipped).not.toHaveBeenCalled();
    });

    it('does NOT notify when the waybill is entered before the parcel ships', async () => {
      seed(
        { status: OrderStatus.PROCESSING, trackingNumber: null },
        { trackingNumber: '20450000000001' },
      );

      await service.adminUpdateDetails('order-uuid-1', { trackingNumber: '20450000000001' });

      // The SHIPPED transition carries the number when it happens.
      expect(mailOutboxServiceMock.enqueueOrderShipped).not.toHaveBeenCalled();
    });

    it('does NOT notify when a waybill is cleared', async () => {
      seed({ status: OrderStatus.SHIPPED, trackingNumber: '20450000000001' });

      await service.adminUpdateDetails('order-uuid-1', { trackingNumber: null });

      expect(mailOutboxServiceMock.enqueueOrderShipped).not.toHaveBeenCalled();
    });

    it('rejects a stale edit with ORDER_STALE before writing anything', async () => {
      seed({ status: OrderStatus.SHIPPED, updatedAt: new Date('2026-07-28T10:20:00.000Z') });

      await expect(
        service.adminUpdateDetails(
          'order-uuid-1',
          { trackingNumber: '1' },
          { expectedUpdatedAt: new Date('2026-07-28T10:15:30.000Z') },
        ),
      ).rejects.toMatchObject({ response: { error: 'ORDER_STALE' } });

      expect(orderRepositoryMock.updateDetails).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the order does not exist', async () => {
      orderRepositoryMock.findById.mockResolvedValue(null);

      await expect(service.adminUpdateDetails('missing', { trackingNumber: '1' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── internalNotes containment (TASK-336) ────────────────────────────────────
  // `notes` is the customer's field; `internalNotes` is the operator's. Mixing
  // them leaks internal remarks to the buyer.

  describe('internalNotes is admin-only', () => {
    const withNotes = () =>
      makeOrder({ internalNotes: 'Suspected fraud — call before dispatch', userId: USER_ID });

    it('is absent from a customer order read', async () => {
      orderRepositoryMock.findById.mockResolvedValue(withNotes());

      const result = await service.getOrder(USER_ID, 'order-uuid-1');

      expect(result.internalNotes).toBeUndefined();
    });

    it('is absent from the customer order list', async () => {
      orderRepositoryMock.findByUserId.mockResolvedValue({ orders: [withNotes()], total: 1 });

      const result = await service.getOrders(USER_ID, {});

      expect(result.data[0].internalNotes).toBeUndefined();
    });

    it('is absent from a guest order read', async () => {
      orderRepositoryMock.findByAccessTokenHash.mockResolvedValue(
        makeOrder({ userId: null, createdAt: new Date(), internalNotes: 'Do not ship' }),
      );

      const result = await service.getGuestOrder('c'.repeat(64));

      expect(result.internalNotes).toBeUndefined();
    });

    it('IS present on the admin order read', async () => {
      orderRepositoryMock.findByIdForAdmin.mockResolvedValue(withNotes());

      const result = await service.adminGetOrder('order-uuid-1');

      expect(result.internalNotes).toBe('Suspected fraud — call before dispatch');
    });

    it('IS present on every row of the admin list', async () => {
      orderRepositoryMock.findAll.mockResolvedValue({ orders: [withNotes()], total: 1 });

      const result = await service.adminGetAllOrders({});

      expect(result.data[0].internalNotes).toBe('Suspected fraud — call before dispatch');
    });
  });

  // ─── Guest checkout (TASK-338) ───────────────────────────────────────────────
  // A guest could always FILL a cart; the barrier stood at order creation, which
  // made the storefront's "order in two minutes, no registration" promise untrue.

  describe('createOrder — guest', () => {
    const guestCart: CartWithItems = { ...cartWithItems, userId: null, token: GUEST_CART_TOKEN };

    beforeEach(() => {
      cartRepositoryMock.findByToken.mockResolvedValue(guestCart);
      resolveCreateWithHook(makeOrder({ userId: null, guestEmail: guestContact.email }));
    });

    it('loads the cart by its cookie token, never by a user id', async () => {
      await service.createOrder(guestActor, createDto);

      expect(cartRepositoryMock.findByToken).toHaveBeenCalledWith(GUEST_CART_TOKEN);
      expect(cartRepositoryMock.findByUserId).not.toHaveBeenCalled();
    });

    it('never looks up a user (there is no account to ban-check)', async () => {
      await service.createOrder(guestActor, createDto);

      expect(userRepositoryMock.findById).not.toHaveBeenCalled();
    });

    it('writes the order with a null userId and the contact snapshot', async () => {
      await service.createOrder(guestActor, createDto);

      expect(orderRepositoryMock.createFromCart).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: null,
          guest: expect.objectContaining({
            email: guestContact.email,
            phone: guestContact.phone,
            name: guestContact.name,
          }),
        }),
        expect.any(Function),
      );
    });

    it('stores only a SHA-256 of the access token, never the raw value', async () => {
      await service.createOrder(guestActor, createDto);

      const params = orderRepositoryMock.createFromCart.mock.calls[0][0] as {
        guest: { accessTokenHash: string };
      };
      // 64 hex chars — a SHA-256 digest, not something a leaked dump can use.
      expect(params.guest.accessTokenHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('mints a different token for every order', async () => {
      await service.createOrder(guestActor, createDto);
      await service.createOrder(guestActor, createDto);

      const first = orderRepositoryMock.createFromCart.mock.calls[0][0] as {
        guest: { accessTokenHash: string };
      };
      const second = orderRepositoryMock.createFromCart.mock.calls[1][0] as {
        guest: { accessTokenHash: string };
      };
      expect(first.guest.accessTokenHash).not.toBe(second.guest.accessTokenHash);
    });

    it('addresses the confirmation email from the ORDER, not from a user row', async () => {
      await service.createOrder(guestActor, createDto);

      expect(mailOutboxServiceMock.enqueueOrderConfirmation).toHaveBeenCalledWith(
        expect.objectContaining({
          to: guestContact.email,
          customerName: guestContact.name,
        }),
        txMock,
      );
    });

    it('puts the raw token in the emailed status link — the one place it exists', async () => {
      configValues.set('STORE_CLIENT_URL', 'https://shop.example.com');

      await service.createOrder(guestActor, createDto);

      const params = mailOutboxServiceMock.enqueueOrderConfirmation.mock.calls[0][0] as unknown as {
        orderStatusUrl: string;
      };
      expect(params.orderStatusUrl).toMatch(
        /^https:\/\/shop\.example\.com\/orders\/guest\/[a-f0-9]{64}$/,
      );
    });

    it('does not double the slash when STORE_CLIENT_URL has a trailing one', async () => {
      configValues.set('STORE_CLIENT_URL', 'https://shop.example.com/');

      await service.createOrder(guestActor, createDto);

      const params = mailOutboxServiceMock.enqueueOrderConfirmation.mock.calls[0][0] as unknown as {
        orderStatusUrl: string;
      };
      expect(params.orderStatusUrl).toContain('https://shop.example.com/orders/guest/');
    });

    it('sends no status link rather than a localhost one when STORE_CLIENT_URL is unset', async () => {
      await service.createOrder(guestActor, createDto);

      const params = mailOutboxServiceMock.enqueueOrderConfirmation.mock.calls[0][0] as unknown as {
        orderStatusUrl?: string;
      };
      // A default of http://localhost:3000 is exactly the bug this project already
      // paid for once — it works in dev and points real customers at their laptop.
      expect(params.orderStatusUrl).toBeUndefined();
    });

    it('rejects a promo code, because a redemption needs an account it does not have', async () => {
      await expect(
        service.createOrder(guestActor, { ...createDto, discountCode: 'SUMMER10' }),
      ).rejects.toThrow(BadRequestException);

      expect(discountServiceMock.computeDiscount).not.toHaveBeenCalled();
      expect(orderRepositoryMock.createFromCart).not.toHaveBeenCalled();
    });

    it('404s when the guest cart cookie points at nothing', async () => {
      cartRepositoryMock.findByToken.mockResolvedValue(null);

      await expect(service.createOrder(guestActor, createDto)).rejects.toThrow(NotFoundException);
    });

    it('applies the same stock and availability gates as an account order', async () => {
      cartRepositoryMock.findByToken.mockResolvedValue({
        ...guestCart,
        items: cartWithLowStock.items,
      });

      await expect(service.createOrder(guestActor, createDto)).rejects.toThrow(BadRequestException);
    });

    it('mints no token at all for an account order', async () => {
      userRepositoryMock.findById.mockResolvedValue(recipient);
      cartRepositoryMock.findByUserId.mockResolvedValue(cartWithItems);
      resolveCreateWithHook();

      await service.createOrder(userActor, createDto);

      const params = orderRepositoryMock.createFromCart.mock.calls[0][0] as { guest?: unknown };
      expect(params.guest).toBeUndefined();
    });
  });

  // ─── getGuestOrder (TASK-338) ────────────────────────────────────────────────
  // Edge case E-17: without this a guest goes blind the moment the cart cookie is
  // gone or they open the confirmation email on another device.

  describe('getGuestOrder', () => {
    const RAW_TOKEN = 'a'.repeat(64);
    // SHA-256 of the raw token above — the value the repository is queried with.
    const hashOf = (raw: string) => createHash('sha256').update(raw).digest('hex');

    it('hashes the token before looking it up (the raw value never hits the DB)', async () => {
      orderRepositoryMock.findByAccessTokenHash.mockResolvedValue(makeOrder({ userId: null }));

      await service.getGuestOrder(RAW_TOKEN);

      expect(orderRepositoryMock.findByAccessTokenHash).toHaveBeenCalledWith(hashOf(RAW_TOKEN));
      expect(orderRepositoryMock.findByAccessTokenHash).not.toHaveBeenCalledWith(RAW_TOKEN);
    });

    it('returns the order for a valid, unexpired token', async () => {
      orderRepositoryMock.findByAccessTokenHash.mockResolvedValue(
        makeOrder({ userId: null, createdAt: new Date() }),
      );

      const result = await service.getGuestOrder(RAW_TOKEN);

      expect(result).toBeInstanceOf(OrderEntity);
    });

    it('404s on an unknown token', async () => {
      orderRepositoryMock.findByAccessTokenHash.mockResolvedValue(null);

      await expect(service.getGuestOrder(RAW_TOKEN)).rejects.toThrow(NotFoundException);
    });

    it('404s once the link is older than the configured window', async () => {
      configValues.set('GUEST_ORDER_TOKEN_TTL_DAYS', 30);
      orderRepositoryMock.findByAccessTokenHash.mockResolvedValue(
        makeOrder({ userId: null, createdAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) }),
      );

      await expect(service.getGuestOrder(RAW_TOKEN)).rejects.toThrow(NotFoundException);
    });

    it('still serves an order inside the configured window', async () => {
      configValues.set('GUEST_ORDER_TOKEN_TTL_DAYS', 30);
      orderRepositoryMock.findByAccessTokenHash.mockResolvedValue(
        makeOrder({ userId: null, createdAt: new Date(Date.now() - 29 * 24 * 60 * 60 * 1000) }),
      );

      await expect(service.getGuestOrder(RAW_TOKEN)).resolves.toBeInstanceOf(OrderEntity);
    });

    it('defaults to 60 days when the TTL is not configured', async () => {
      orderRepositoryMock.findByAccessTokenHash.mockResolvedValue(
        makeOrder({ userId: null, createdAt: new Date(Date.now() - 61 * 24 * 60 * 60 * 1000) }),
      );

      await expect(service.getGuestOrder(RAW_TOKEN)).rejects.toThrow(NotFoundException);
    });

    it('answers expired and unknown identically (no oracle for token guessing)', async () => {
      configValues.set('GUEST_ORDER_TOKEN_TTL_DAYS', 1);
      orderRepositoryMock.findByAccessTokenHash.mockResolvedValue(
        makeOrder({ userId: null, createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) }),
      );
      const expired = await service.getGuestOrder(RAW_TOKEN).catch((err: Error) => err.message);

      orderRepositoryMock.findByAccessTokenHash.mockResolvedValue(null);
      const unknown = await service.getGuestOrder(RAW_TOKEN).catch((err: Error) => err.message);

      expect(expired).toBe(unknown);
    });
  });

  // ─── claimGuestOrders (TASK-338) ─────────────────────────────────────────────

  describe('claimGuestOrders', () => {
    it('claims by normalised email so a mixed-case registration still matches', async () => {
      orderRepositoryMock.claimGuestOrders.mockResolvedValue(2);

      const claimed = await service.claimGuestOrders(USER_ID, '  Guest@Example.COM ');

      expect(orderRepositoryMock.claimGuestOrders).toHaveBeenCalledWith(
        USER_ID,
        'guest@example.com',
      );
      expect(claimed).toBe(2);
    });

    it('is a harmless no-op for an email with no guest orders behind it', async () => {
      orderRepositoryMock.claimGuestOrders.mockResolvedValue(0);

      await expect(service.claimGuestOrders(USER_ID, 'nobody@example.com')).resolves.toBe(0);
    });
  });

  // ─── applyPaymentEvent (TASK-330) ────────────────────────────────────────────
  // The ONE door through which the payment module moves an order. Everything the
  // provider says is translated by the adapter before it gets here; what is
  // decided here is what that translation MEANS for this particular order.

  describe('applyPaymentEvent', () => {
    const PAYMENT_ID = 'payment-uuid-1';

    const makePayment = (
      order: Partial<PaymentWithOrderRow['order']> = {},
      payment: Partial<PaymentWithOrderRow> = {},
    ): PaymentWithOrderRow => ({
      id: PAYMENT_ID,
      orderId: 'order-uuid-1',
      provider: 'liqpay',
      providerPaymentId: null,
      amount: { toString: () => '69.97' },
      currency: 'UAH',
      status: PaymentAttemptStatus.PENDING,
      ...payment,
      order: {
        id: 'order-uuid-1',
        status: OrderStatus.PENDING,
        paymentStatus: PaymentStatus.PENDING,
        paidAt: null,
        reservationExpiresAt: new Date('2026-07-28T10:45:00.000Z'),
        ...order,
      },
    });

    const makeEvent = (overrides: Partial<PaymentEventInput> = {}): PaymentEventInput => ({
      paymentId: PAYMENT_ID,
      providerStatus: 'success',
      providerPaymentId: 'liqpay-9001',
      outcome: PaymentOutcome.SUCCEEDED,
      amount: '69.97',
      currency: 'UAH',
      payload: { status: 'success' },
      ...overrides,
    });

    const seed = (payment: PaymentWithOrderRow) => {
      orderRepositoryMock.findPaymentWithOrder.mockResolvedValue(payment);
      orderRepositoryMock.applyPaymentOutcome.mockResolvedValue(makeOrder());
    };

    /** The plan handed to the repository by the last accepted call. */
    const lastPlan = () =>
      orderRepositoryMock.applyPaymentOutcome.mock.calls[0][0] as PaymentApplyPlan;

    it('throws NotFoundException when the payment does not exist', async () => {
      orderRepositoryMock.findPaymentWithOrder.mockResolvedValue(null);

      await expect(service.applyPaymentEvent(makeEvent())).rejects.toThrow(NotFoundException);
      expect(orderRepositoryMock.applyPaymentOutcome).not.toHaveBeenCalled();
    });

    // ── Rule 2: verify the money before believing it ──────────────────────────

    describe('amount verification', () => {
      it('rejects an event that reports a different amount than was charged', async () => {
        seed(makePayment());

        await expect(service.applyPaymentEvent(makeEvent({ amount: '1.00' }))).rejects.toThrow(
          BadRequestException,
        );
        // Rejected, NOT quietly ignored: a tampered amount is an attack, and
        // `applied: false` would file it next to "still processing".
        expect(orderRepositoryMock.applyPaymentOutcome).not.toHaveBeenCalled();
      });

      it('rejects an event that reports a different currency', async () => {
        seed(makePayment());

        await expect(service.applyPaymentEvent(makeEvent({ currency: 'USD' }))).rejects.toThrow(
          BadRequestException,
        );
      });

      it('accepts the same money written differently ("69.970" vs "69.97")', async () => {
        seed(makePayment());

        const result = await service.applyPaymentEvent(makeEvent({ amount: '69.970' }));

        expect(result.applied).toBe(true);
      });

      it('accepts a lower-case currency code', async () => {
        seed(makePayment());

        const result = await service.applyPaymentEvent(makeEvent({ currency: 'uah' }));

        expect(result.applied).toBe(true);
      });
    });

    // ── SUCCEEDED ─────────────────────────────────────────────────────────────

    describe('SUCCEEDED', () => {
      it('marks the order paid, stamps paidAt and lifts the reservation deadline', async () => {
        seed(makePayment());

        const result = await service.applyPaymentEvent(makeEvent());

        expect(result).toEqual({ applied: true, orderId: 'order-uuid-1' });
        const plan = lastPlan();
        expect(plan.attemptStatus).toBe(PaymentAttemptStatus.SUCCEEDED);
        expect(plan.paymentStatusChange).toEqual({
          from: PaymentStatus.PENDING,
          to: PaymentStatus.PAID,
        });
        expect(plan.paidAt).toBeInstanceOf(Date);
        // A paid order's reservation is no longer provisional — leaving the
        // deadline set would let the auto-cancel worker cancel a paid order.
        expect(plan.clearReservation).toBe(true);
      });

      it('advances a still-PENDING order to CONFIRMED', async () => {
        seed(makePayment());

        await service.applyPaymentEvent(makeEvent());

        expect(lastPlan().statusChange).toEqual({
          from: OrderStatus.PENDING,
          to: OrderStatus.CONFIRMED,
        });
      });

      it('records the provider payment id it learned from the callback', async () => {
        seed(makePayment());

        await service.applyPaymentEvent(makeEvent());

        expect(lastPlan().providerPaymentId).toBe('liqpay-9001');
      });

      // ── The reason the state machine had to land first ──────────────────────
      it.each([OrderStatus.PROCESSING, OrderStatus.SHIPPED, OrderStatus.DELIVERED])(
        'records the money but leaves a %s order where the operator put it',
        async (status) => {
          seed(makePayment({ status }));

          await service.applyPaymentEvent(makeEvent());

          const plan = lastPlan();
          expect(plan.paymentStatusChange?.to).toBe(PaymentStatus.PAID);
          // → CONFIRMED is not a legal move from here, so the callback must not
          // drag the order backwards the way it would have before TASK-332.
          expect(plan.statusChange).toBeUndefined();
        },
      );

      it('changes nothing when the order is already PAID (a re-delivered callback)', async () => {
        seed(makePayment({ paymentStatus: PaymentStatus.PAID, paidAt: new Date() }));

        const result = await service.applyPaymentEvent(makeEvent());

        expect(result).toEqual({ applied: false, orderId: 'order-uuid-1' });
        expect(orderRepositoryMock.applyPaymentOutcome).not.toHaveBeenCalled();
      });
    });

    // ── FAILED ────────────────────────────────────────────────────────────────

    describe('FAILED', () => {
      const failure = makeEvent({
        outcome: PaymentOutcome.FAILED,
        providerStatus: 'failure',
        failureCode: '4159',
        failureMessage: 'Card declined',
      });

      it('marks an unpaid order FAILED and keeps the provider diagnostics', async () => {
        seed(makePayment());

        const result = await service.applyPaymentEvent(failure);

        expect(result.applied).toBe(true);
        const plan = lastPlan();
        expect(plan.attemptStatus).toBe(PaymentAttemptStatus.FAILED);
        expect(plan.paymentStatusChange).toEqual({
          from: PaymentStatus.PENDING,
          to: PaymentStatus.FAILED,
        });
        expect(plan.failureCode).toBe('4159');
        expect(plan.failureMessage).toBe('Card declined');
      });

      it('never cancels the order or touches its stock (the customer may retry)', async () => {
        seed(makePayment());

        await service.applyPaymentEvent(failure);

        const plan = lastPlan();
        expect(plan.statusChange).toBeUndefined();
        expect(orderRepositoryMock.cancelAndRestock).not.toHaveBeenCalled();
      });

      it('does NOT un-pay an already-PAID order (a late failure for a superseded attempt)', async () => {
        seed(makePayment({ paymentStatus: PaymentStatus.PAID, paidAt: new Date() }));

        await service.applyPaymentEvent(failure);

        const plan = lastPlan();
        // The attempt itself is still recorded as failed — the shopper's first
        // card really was declined — but the order stays paid.
        expect(plan.attemptStatus).toBe(PaymentAttemptStatus.FAILED);
        expect(plan.paymentStatusChange).toBeUndefined();
      });
    });

    // ── REFUNDED ──────────────────────────────────────────────────────────────

    describe('REFUNDED', () => {
      const refund = makeEvent({ outcome: PaymentOutcome.REFUNDED, providerStatus: 'reversed' });

      it('refunds the payment and moves a DELIVERED order to REFUNDED', async () => {
        seed(makePayment({ status: OrderStatus.DELIVERED, paymentStatus: PaymentStatus.PAID }));

        await service.applyPaymentEvent(refund);

        const plan = lastPlan();
        expect(plan.attemptStatus).toBe(PaymentAttemptStatus.REFUNDED);
        expect(plan.paymentStatusChange).toEqual({
          from: PaymentStatus.PAID,
          to: PaymentStatus.REFUNDED,
        });
        expect(plan.statusChange).toEqual({
          from: OrderStatus.DELIVERED,
          to: OrderStatus.REFUNDED,
        });
      });

      it('records the money without a status move when REFUNDED is not reachable', async () => {
        // Nothing shipped, so the order cannot become REFUNDED — but the money
        // really did go back and the ledger has to say so.
        seed(makePayment({ status: OrderStatus.PENDING, paymentStatus: PaymentStatus.PAID }));

        await service.applyPaymentEvent(refund);

        expect(lastPlan().paymentStatusChange?.to).toBe(PaymentStatus.REFUNDED);
        expect(lastPlan().statusChange).toBeUndefined();
      });

      it('never auto-restocks — the goods have to come back first (TASK-124)', async () => {
        seed(makePayment({ status: OrderStatus.DELIVERED, paymentStatus: PaymentStatus.PAID }));

        await service.applyPaymentEvent(refund);

        expect(orderRepositoryMock.cancelAndRestock).not.toHaveBeenCalled();
      });

      it('changes nothing on a second refund callback', async () => {
        seed(makePayment({ paymentStatus: PaymentStatus.REFUNDED }));

        const result = await service.applyPaymentEvent(refund);

        expect(result.applied).toBe(false);
        expect(orderRepositoryMock.applyPaymentOutcome).not.toHaveBeenCalled();
      });
    });

    // ── IGNORED ───────────────────────────────────────────────────────────────

    it('changes nothing for an IGNORED outcome ("still processing")', async () => {
      seed(makePayment());

      const result = await service.applyPaymentEvent(
        makeEvent({ outcome: PaymentOutcome.IGNORED, providerStatus: 'wait_secure' }),
      );

      expect(result).toEqual({ applied: false, orderId: 'order-uuid-1' });
      expect(orderRepositoryMock.applyPaymentOutcome).not.toHaveBeenCalled();
    });

    it('verifies the amount even on an outcome it will not act upon', async () => {
      // Order matters: an "in progress" notification carrying the wrong money is
      // still evidence of tampering, and reporting it as a boring no-op hides that.
      seed(makePayment());

      await expect(
        service.applyPaymentEvent(makeEvent({ outcome: PaymentOutcome.IGNORED, amount: '0.01' })),
      ).rejects.toThrow(BadRequestException);
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
