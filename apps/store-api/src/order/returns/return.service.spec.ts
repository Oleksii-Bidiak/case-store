import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { OrderStatus, ReturnStatus } from '@prisma/client';
import { ReturnService } from './return.service';
import { ReturnRepository } from './return.repository';
import { OrderRepository } from '../order.repository';
import { ReturnEntity } from './entities';
import type { ReturnWithItems } from './return.types';
import type { OrderWithItems } from '../order.types';

const USER_ID = 'user-uuid-1';
const OTHER_USER_ID = 'user-uuid-2';
const ORDER_ID = 'order-uuid-1';
const RETURN_ID = 'return-uuid-1';
const LINE_ID = 'order-item-1';
const now = new Date('2026-07-28T12:00:00.000Z');

const makeOrder = (overrides: Partial<OrderWithItems> = {}): OrderWithItems =>
  ({
    id: ORDER_ID,
    userId: USER_ID,
    status: OrderStatus.DELIVERED,
    restockedAt: null,
    createdAt: now,
    updatedAt: now,
    items: [
      {
        id: LINE_ID,
        orderId: ORDER_ID,
        productId: 'product-uuid-1',
        // Three bought — the interesting case, because a customer may send back
        // one now and another later.
        quantity: 3,
        price: { toString: () => '499.00' },
        createdAt: now,
        product: { id: 'product-uuid-1', name: 'Case', slug: 'case', images: [] },
        addons: [],
      },
    ],
    ...overrides,
  }) as OrderWithItems;

const makeReturn = (overrides: Partial<ReturnWithItems> = {}): ReturnWithItems =>
  ({
    id: RETURN_ID,
    orderId: ORDER_ID,
    status: ReturnStatus.REQUESTED,
    reason: 'Not the right size',
    operatorNotes: null,
    requestedAt: now,
    resolvedAt: null,
    restockedAt: null,
    refundedAmount: null,
    createdAt: now,
    updatedAt: now,
    items: [
      {
        id: 'return-item-1',
        returnId: RETURN_ID,
        orderItemId: LINE_ID,
        quantity: 1,
        createdAt: now,
        orderItem: {
          id: LINE_ID,
          productId: 'product-uuid-1',
          quantity: 3,
          price: { toString: () => '499.00' },
          product: { id: 'product-uuid-1', name: 'Case', slug: 'case' },
        },
      },
    ],
    ...overrides,
  }) as ReturnWithItems;

const returnRepositoryMock = {
  create: jest.fn(),
  findById: jest.fn(),
  findByOrderId: jest.fn(),
  findAll: jest.fn(),
  resolve: jest.fn(),
};

const orderRepositoryMock = {
  findById: jest.fn(),
};

const pinoLoggerMock = {
  setContext: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe('ReturnService (TASK-340)', () => {
  let service: ReturnService;

  beforeEach(async () => {
    jest.clearAllMocks();
    returnRepositoryMock.findByOrderId.mockResolvedValue([]);
    returnRepositoryMock.create.mockResolvedValue(makeReturn());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReturnService,
        { provide: ReturnRepository, useValue: returnRepositoryMock },
        { provide: OrderRepository, useValue: orderRepositoryMock },
        { provide: PinoLogger, useValue: pinoLoggerMock },
      ],
    }).compile();

    service = module.get(ReturnService);
  });

  // ─── createReturn ───────────────────────────────────────────────────────────

  describe('createReturn', () => {
    const dto = { items: [{ orderItemId: LINE_ID, quantity: 1 }] };

    it('opens a return against a delivered order the caller owns', async () => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder());

      const result = await service.createReturn(USER_ID, ORDER_ID, dto);

      expect(result).toBeInstanceOf(ReturnEntity);
      expect(returnRepositoryMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ orderId: ORDER_ID, items: dto.items }),
      );
    });

    it('404s on someone else’s order without admitting it exists', async () => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder({ userId: OTHER_USER_ID }));

      await expect(service.createReturn(USER_ID, ORDER_ID, dto)).rejects.toThrow(NotFoundException);
      expect(returnRepositoryMock.create).not.toHaveBeenCalled();
    });

    it.each([OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PROCESSING])(
      'refuses a return on a %s order — that is a cancellation, not a return',
      async (status) => {
        orderRepositoryMock.findById.mockResolvedValue(makeOrder({ status }));

        await expect(service.createReturn(USER_ID, ORDER_ID, dto)).rejects.toThrow(
          BadRequestException,
        );
      },
    );

    it.each([OrderStatus.SHIPPED, OrderStatus.DELIVERED])(
      'accepts a return on a %s order (the goods are with the customer)',
      async (status) => {
        orderRepositoryMock.findById.mockResolvedValue(makeOrder({ status }));

        await expect(service.createReturn(USER_ID, ORDER_ID, dto)).resolves.toBeInstanceOf(
          ReturnEntity,
        );
      },
    );

    it('refuses a line that is not part of this order', async () => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder());

      await expect(
        service.createReturn(USER_ID, ORDER_ID, {
          items: [{ orderItemId: 'someone-elses-line', quantity: 1 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses more units than were bought', async () => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder());

      await expect(
        service.createReturn(USER_ID, ORDER_ID, { items: [{ orderItemId: LINE_ID, quantity: 4 }] }),
      ).rejects.toThrow(BadRequestException);
    });

    // ── The cap is over the SUM of live returns, not over one request ─────────
    // Otherwise a buyer could return the same unit repeatedly, one request at a
    // time, and be credited for each.

    it('counts units already claimed by earlier returns', async () => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder());
      returnRepositoryMock.findByOrderId.mockResolvedValue([
        makeReturn({ items: [{ ...makeReturn().items[0], quantity: 2 }] }),
      ]);

      // Two already claimed of three bought — one remains.
      await expect(
        service.createReturn(USER_ID, ORDER_ID, { items: [{ orderItemId: LINE_ID, quantity: 2 }] }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.createReturn(USER_ID, ORDER_ID, { items: [{ orderItemId: LINE_ID, quantity: 1 }] }),
      ).resolves.toBeInstanceOf(ReturnEntity);
    });

    it('releases the units of a REJECTED return (the shop said no; nothing came back)', async () => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder());
      returnRepositoryMock.findByOrderId.mockResolvedValue([
        makeReturn({
          status: ReturnStatus.REJECTED,
          items: [{ ...makeReturn().items[0], quantity: 3 }],
        }),
      ]);

      await expect(
        service.createReturn(USER_ID, ORDER_ID, { items: [{ orderItemId: LINE_ID, quantity: 3 }] }),
      ).resolves.toBeInstanceOf(ReturnEntity);
    });

    it.each([ReturnStatus.REQUESTED, ReturnStatus.APPROVED, ReturnStatus.RECEIVED])(
      'keeps the units of a %s return claimed',
      async (status) => {
        orderRepositoryMock.findById.mockResolvedValue(makeOrder());
        returnRepositoryMock.findByOrderId.mockResolvedValue([
          makeReturn({ status, items: [{ ...makeReturn().items[0], quantity: 3 }] }),
        ]);

        await expect(
          service.createReturn(USER_ID, ORDER_ID, {
            items: [{ orderItemId: LINE_ID, quantity: 1 }],
          }),
        ).rejects.toThrow(BadRequestException);
      },
    );
  });

  // ─── resolveReturn ──────────────────────────────────────────────────────────

  describe('resolveReturn', () => {
    beforeEach(() => {
      returnRepositoryMock.resolve.mockImplementation((_id: string, fields: { status: string }) =>
        Promise.resolve(makeReturn({ status: fields.status as ReturnStatus })),
      );
    });

    it('records an approval and stamps the resolution time', async () => {
      returnRepositoryMock.findById.mockResolvedValue(makeReturn());

      await service.resolveReturn(RETURN_ID, { status: ReturnStatus.APPROVED });

      expect(returnRepositoryMock.resolve).toHaveBeenCalledWith(
        RETURN_ID,
        expect.objectContaining({ status: ReturnStatus.APPROVED, resolvedAt: expect.any(Date) }),
        { restock: false },
      );
    });

    it('rejects a transition the state machine forbids, without writing', async () => {
      returnRepositoryMock.findById.mockResolvedValue(
        makeReturn({ status: ReturnStatus.REQUESTED }),
      );

      // Money before the goods are back is how a shop refunds twice.
      await expect(
        service.resolveReturn(RETURN_ID, { status: ReturnStatus.REFUNDED }),
      ).rejects.toThrow(ConflictException);
      expect(returnRepositoryMock.resolve).not.toHaveBeenCalled();
    });

    it('404s on a return that does not exist', async () => {
      returnRepositoryMock.findById.mockResolvedValue(null);

      await expect(
        service.resolveReturn('missing', { status: ReturnStatus.APPROVED }),
      ).rejects.toThrow(NotFoundException);
    });

    it('exposes operatorNotes on the admin response', async () => {
      returnRepositoryMock.findById.mockResolvedValue(makeReturn());
      returnRepositoryMock.resolve.mockResolvedValue(
        makeReturn({ status: ReturnStatus.APPROVED, operatorNotes: 'Refund via card' }),
      );

      const result = await service.resolveReturn(RETURN_ID, {
        status: ReturnStatus.APPROVED,
        operatorNotes: 'Refund via card',
      });

      expect(result.operatorNotes).toBe('Refund via card');
    });

    // ── The double-restock guard, the reason this task exists ─────────────────

    describe('restocking', () => {
      it('credits stock back when the goods are marked RECEIVED', async () => {
        returnRepositoryMock.findById.mockResolvedValue(
          makeReturn({ status: ReturnStatus.APPROVED }),
        );

        await service.resolveReturn(RETURN_ID, { status: ReturnStatus.RECEIVED, restock: true });

        expect(returnRepositoryMock.resolve).toHaveBeenCalledWith(RETURN_ID, expect.anything(), {
          restock: true,
        });
      });

      it('refuses to restock a return whose goods were already credited back', async () => {
        returnRepositoryMock.findById.mockResolvedValue(
          makeReturn({ status: ReturnStatus.APPROVED, restockedAt: new Date() }),
        );

        // Same invariant as Order.restockedAt: one box back, one increment. Two
        // would be phantom inventory, sold to someone who never receives it.
        await expect(
          service.resolveReturn(RETURN_ID, { status: ReturnStatus.RECEIVED, restock: true }),
        ).rejects.toThrow(ConflictException);
        expect(returnRepositoryMock.resolve).not.toHaveBeenCalled();
      });

      it('refuses a restock requested for any status but RECEIVED', async () => {
        returnRepositoryMock.findById.mockResolvedValue(makeReturn());

        await expect(
          service.resolveReturn(RETURN_ID, { status: ReturnStatus.APPROVED, restock: true }),
        ).rejects.toThrow(BadRequestException);
      });

      it('does not restock unless asked — arriving is not the same as being sellable', async () => {
        returnRepositoryMock.findById.mockResolvedValue(
          makeReturn({ status: ReturnStatus.APPROVED }),
        );

        await service.resolveReturn(RETURN_ID, { status: ReturnStatus.RECEIVED });

        // Goods can come back broken, opened, or not ours at all. Only the
        // operator can see which.
        expect(returnRepositoryMock.resolve).toHaveBeenCalledWith(RETURN_ID, expect.anything(), {
          restock: false,
        });
      });

      it('never restocks on the refund step (the goods came back at RECEIVED)', async () => {
        returnRepositoryMock.findById.mockResolvedValue(
          makeReturn({ status: ReturnStatus.RECEIVED, restockedAt: new Date() }),
        );

        await service.resolveReturn(RETURN_ID, { status: ReturnStatus.REFUNDED });

        expect(returnRepositoryMock.resolve).toHaveBeenCalledWith(RETURN_ID, expect.anything(), {
          restock: false,
        });
      });
    });
  });
});
