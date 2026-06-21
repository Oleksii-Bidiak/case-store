import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import { OrderRepository } from './order.repository';
import { OrderService } from './order.service';
import { OrderEntity } from './entities';
import { CartRepository, CartWithItems } from '../cart/cart.repository';
import { UserRepository } from '../user/user.repository';
import { MailService } from '../mail/mail.service';
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
      variantId: 'variant-uuid-1',
      quantity: 2,
      createdAt: now,
      updatedAt: now,
      product: {
        id: 'product-uuid-1',
        name: 'iPhone 15 Pro Case',
        price: { toString: () => '29.99' } as never,
        compareAtPrice: null,
        isActive: true,
      },
      variant: {
        id: 'variant-uuid-1',
        name: 'Black / iPhone 15 Pro',
        price: { toString: () => '29.99' } as never,
        stock: 50,
        isActive: true,
      },
    },
    {
      id: 'cart-item-2',
      productId: 'product-uuid-2',
      variantId: null,
      quantity: 1,
      createdAt: now,
      updatedAt: now,
      product: {
        id: 'product-uuid-2',
        name: 'Screen Protector',
        price: { toString: () => '9.99' } as never,
        compareAtPrice: null,
        isActive: true,
      },
      variant: null,
    },
  ],
};

const emptyCart: CartWithItems = { ...cartWithItems, items: [] };

const cartWithLowStock: CartWithItems = {
  ...cartWithItems,
  items: [
    {
      ...cartWithItems.items[0],
      quantity: 5, // exceeds variant stock of 1 below
      variant: { ...cartWithItems.items[0].variant!, stock: 1 },
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
  items: [
    {
      id: 'order-item-1',
      orderId: 'order-uuid-1',
      productId: 'product-uuid-1',
      variantId: 'variant-uuid-1',
      quantity: 2,
      price: { toString: () => '29.99' },
      createdAt: now,
      product: { id: 'product-uuid-1', name: 'iPhone 15 Pro Case', slug: 'iphone-15-pro-case' },
      variant: { id: 'variant-uuid-1', name: 'Black / iPhone 15 Pro' },
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
  updateStatus: jest.fn(),
  cancelAndRestock: jest.fn(),
  updatePaymentStatus: jest.fn(),
  markPaid: jest.fn(),
};

const cartRepositoryMock = {
  findByUserId: jest.fn(),
};

const userRepositoryMock = {
  findById: jest.fn(),
};

const mailServiceMock = {
  sendOrderConfirmation: jest.fn(),
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
} as User;

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
        { provide: MailService, useValue: mailServiceMock },
        { provide: PinoLogger, useValue: pinoLoggerMock },
      ],
    }).compile();

    service = module.get<OrderService>(OrderService);
  });

  // ─── createOrder ──────────────────────────────────────────────────────────

  describe('createOrder', () => {
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

      expect(orderRepositoryMock.createFromCart).toHaveBeenCalledWith({
        userId: USER_ID,
        cartId: 'cart-uuid-1',
        cartItems: cartWithItems.items,
        shippingAddress: address,
        billingAddress: undefined,
        notes: undefined,
      });
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

    it('should throw BadRequestException when a variant has insufficient stock', async () => {
      cartRepositoryMock.findByUserId.mockResolvedValue(cartWithLowStock);

      await expect(service.createOrder(USER_ID, createDto)).rejects.toThrow(BadRequestException);
      expect(orderRepositoryMock.createFromCart).not.toHaveBeenCalled();
    });
  });

  // ─── createOrder → email dispatch (fault-isolated side-effect) ──────────────

  describe('createOrder — email dispatch', () => {
    beforeEach(() => {
      cartRepositoryMock.findByUserId.mockResolvedValue(cartWithItems);
      orderRepositoryMock.createFromCart.mockResolvedValue(makeOrder());
    });

    it('sends a confirmation email to the recipient after a successful create', async () => {
      userRepositoryMock.findById.mockResolvedValue(recipient);

      const result = await service.createOrder(USER_ID, createDto);

      expect(userRepositoryMock.findById).toHaveBeenCalledWith(USER_ID);
      expect(mailServiceMock.sendOrderConfirmation).toHaveBeenCalledTimes(1);
      expect(mailServiceMock.sendOrderConfirmation).toHaveBeenCalledWith({
        to: recipient.email,
        order: result,
        customerName: recipient.firstName,
      });
      expect(result).toBeInstanceOf(OrderEntity);
    });

    it('still resolves with the order when the email send rejects (fault isolation)', async () => {
      userRepositoryMock.findById.mockResolvedValue(recipient);
      mailServiceMock.sendOrderConfirmation.mockRejectedValue(new Error('SMTP unavailable'));

      const result = await service.createOrder(USER_ID, createDto);

      expect(result).toBeInstanceOf(OrderEntity);
      expect(result.id).toBe('order-uuid-1');
    });

    it('does not attempt an email when the recipient user is not found', async () => {
      userRepositoryMock.findById.mockResolvedValue(null);

      const result = await service.createOrder(USER_ID, createDto);

      expect(mailServiceMock.sendOrderConfirmation).not.toHaveBeenCalled();
      expect(result).toBeInstanceOf(OrderEntity);
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

  // ─── confirmPayment (admin) ───────────────────────────────────────────────

  describe('confirmPayment', () => {
    it('should mark a PENDING order as PAID and CONFIRMED', async () => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder({ status: OrderStatus.PENDING }));
      orderRepositoryMock.markPaid.mockResolvedValue(
        makeOrder({ status: OrderStatus.CONFIRMED, paymentStatus: PaymentStatus.PAID }),
      );

      const result = await service.confirmPayment('order-uuid-1');

      expect(orderRepositoryMock.markPaid).toHaveBeenCalledWith('order-uuid-1');
      expect(result.status).toBe(OrderStatus.CONFIRMED);
      expect(result.paymentStatus).toBe(PaymentStatus.PAID);
    });

    it('should throw NotFoundException when the order does not exist', async () => {
      orderRepositoryMock.findById.mockResolvedValue(null);

      await expect(service.confirmPayment('missing')).rejects.toThrow(NotFoundException);
      expect(orderRepositoryMock.markPaid).not.toHaveBeenCalled();
    });

    it.each([
      OrderStatus.CONFIRMED,
      OrderStatus.PROCESSING,
      OrderStatus.SHIPPED,
      OrderStatus.DELIVERED,
      OrderStatus.CANCELLED,
      OrderStatus.REFUNDED,
    ])('should throw ConflictException when the order status is %s', async (status) => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder({ status }));

      await expect(service.confirmPayment('order-uuid-1')).rejects.toThrow(ConflictException);
      expect(orderRepositoryMock.markPaid).not.toHaveBeenCalled();
    });
  });

  // ─── updateStatus (internal) ────────────────────────────────────────────────

  describe('updateStatus', () => {
    it('should update the order status without an ownership check', async () => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder({ status: OrderStatus.PENDING }));
      orderRepositoryMock.updateStatus.mockResolvedValue(
        makeOrder({ status: OrderStatus.CONFIRMED }),
      );

      const result = await service.updateStatus('order-uuid-1', OrderStatus.CONFIRMED);

      expect(orderRepositoryMock.updateStatus).toHaveBeenCalledWith(
        'order-uuid-1',
        OrderStatus.CONFIRMED,
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
    it('should return any order by ID without an ownership check', async () => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder({ userId: OTHER_USER_ID }));

      const result = await service.adminGetOrder('order-uuid-1');

      expect(result).toBeInstanceOf(OrderEntity);
      expect(result.id).toBe('order-uuid-1');
      expect(result.userId).toBe(OTHER_USER_ID);
    });

    it('should throw NotFoundException when the order does not exist', async () => {
      orderRepositoryMock.findById.mockResolvedValue(null);

      await expect(service.adminGetOrder('missing')).rejects.toThrow(NotFoundException);
    });
  });
});
