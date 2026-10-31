import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  OrderStatus,
  RepairResult,
  ReturnChannel,
  ReturnDecision,
  ReturnOutcome,
  ReturnRepairStep,
  ReturnStatus,
} from '@prisma/client';
import { MY_RETURNS_LIMIT, ReturnService } from './return.service';
import { ReturnRepository } from './return.repository';
import { OrderRepository } from '../order.repository';
import { ReturnEntity } from './entities';
import type { ReturnWithItems } from './return.types';
import type { OrderWithItems } from '../order.types';
import { ShopNotifier } from '../../notification/shop-notifier.service';

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
    createdByUserId: USER_ID,
    decision: null,
    decisionReason: null,
    decidedAt: null,
    decidedById: null,
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
  findByUserId: jest.fn(),
  findAll: jest.fn(),
  resolve: jest.fn(),
  updateNotes: jest.fn(),
  decide: jest.fn(),
  addRepairStep: jest.fn(),
};

const orderRepositoryMock = {
  findById: jest.fn(),
  // Every write the order repository has that could touch status or payment —
  // mocked so a test can prove a return path calls none of them (TASK-1963).
  updateStatus: jest.fn(),
  updatePaymentStatus: jest.fn(),
  cancelAndRestock: jest.fn(),
  updateDetails: jest.fn(),
  applyPaymentOutcome: jest.fn(),
};

const pinoLoggerMock = {
  setContext: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// TASK-677: the shop's Telegram ping for a customer's request.
const shopNotifierMock = {
  enqueueNewOrder: jest.fn(),
  enqueueContactMessage: jest.fn(),
  enqueueReturnRequested: jest.fn(),
};

/** The transaction client the repository hands the afterCreate hook. */
const txMock = { marker: 'return-tx' };

/**
 * The returns already opened against the order, as the repository reads them
 * INSIDE its locked transaction and hands them to the service's check
 * (TASK-784). The mock mirrors that contract: run the check against this ledger,
 * and insert only if it did not throw.
 */
let ledger: ReturnWithItems[] = [];
/** What the mocked repository actually wrote — only requests that passed the check. */
let inserted: unknown[] = [];

describe('ReturnService (TASK-340)', () => {
  let service: ReturnService;

  beforeEach(async () => {
    jest.clearAllMocks();
    ledger = [];
    inserted = [];
    returnRepositoryMock.findByOrderId.mockResolvedValue([]);
    returnRepositoryMock.create.mockImplementation(
      async (
        params: unknown,
        assertClaimable?: (rows: ReturnWithItems[]) => void,
        afterCreate?: (tx: unknown, created: ReturnWithItems) => Promise<void>,
      ) => {
        assertClaimable?.(ledger);
        inserted.push(params);
        const created = makeReturn();
        // Like the real repository: the hook runs inside the same transaction.
        if (afterCreate) await afterCreate(txMock, created);
        return created;
      },
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReturnService,
        { provide: ReturnRepository, useValue: returnRepositoryMock },
        { provide: OrderRepository, useValue: orderRepositoryMock },
        { provide: PinoLogger, useValue: pinoLoggerMock },
        { provide: ShopNotifier, useValue: shopNotifierMock },
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
        expect.any(Function),
        expect.any(Function),
      );
    });

    it("queues the shop ping through the return's transaction (TASK-677)", async () => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder());

      await service.createReturn(USER_ID, ORDER_ID, dto);

      expect(shopNotifierMock.enqueueReturnRequested).toHaveBeenCalledTimes(1);
      expect(shopNotifierMock.enqueueReturnRequested).toHaveBeenCalledWith(
        { returnId: RETURN_ID, orderId: ORDER_ID, itemsCount: 1, reason: 'Not the right size' },
        txMock,
      );
    });

    it('fails the request when the ping cannot be queued — the hook error propagates (TASK-677)', async () => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder());
      shopNotifierMock.enqueueReturnRequested.mockRejectedValueOnce(new Error('outbox down'));

      await expect(service.createReturn(USER_ID, ORDER_ID, dto)).rejects.toThrow('outbox down');
    });

    // TASK-469: the customer door has always known who it was serving and threw
    // the fact away. Now that a second door writes the same table, "who said
    // this" stops being inferable from the row.
    it('records the customer as the author of their own request', async () => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder());

      await service.createReturn(USER_ID, ORDER_ID, dto);

      expect(returnRepositoryMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ createdByUserId: USER_ID }),
        expect.any(Function),
        expect.any(Function),
      );
    });

    // TASK-1963/2044: what the customer asks for, and which door they used.
    it('passes the requested outcome through and records the ACCOUNT channel', async () => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder());

      await service.createReturn(USER_ID, ORDER_ID, {
        ...dto,
        requestedOutcome: ReturnOutcome.REPLACEMENT,
      });

      expect(returnRepositoryMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          requestedOutcome: ReturnOutcome.REPLACEMENT,
          channel: ReturnChannel.ACCOUNT,
        }),
        expect.any(Function),
        expect.any(Function),
      );
    });

    it('records the ACCOUNT channel even when the customer asked for nothing specific', async () => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder());

      await service.createReturn(USER_ID, ORDER_ID, dto);

      const params = returnRepositoryMock.create.mock.calls[0][0] as Record<string, unknown>;
      expect(params.channel).toBe(ReturnChannel.ACCOUNT);
      expect(params.requestedOutcome).toBeUndefined();
    });

    it('never shows the customer who opened it — that can be a member of staff', async () => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder());
      returnRepositoryMock.create.mockResolvedValue(
        makeReturn({ createdByUserId: 'operator-uuid-1', operatorNotes: 'internal' }),
      );

      const result = await service.createReturn(USER_ID, ORDER_ID, dto);

      expect(result.createdByUserId).toBeUndefined();
      expect(result.operatorNotes).toBeUndefined();
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

    // TASK-784: a ledger read before the insert, in a separate statement, let two
    // concurrent requests both see "0 claimed" and both insert. The ledger is now
    // read by the repository under a lock on the order row, and the cap is run
    // against THAT read — the service must not decide from one of its own.
    it("runs the cap inside the repository's locked write, not against its own earlier read", async () => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder());

      await service.createReturn(USER_ID, ORDER_ID, dto);

      expect(returnRepositoryMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ orderId: ORDER_ID }),
        expect.any(Function),
        expect.any(Function),
      );
      expect(returnRepositoryMock.findByOrderId).not.toHaveBeenCalled();
    });

    it('refuses when the locked ledger shows the last unit was claimed meanwhile', async () => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder());
      // What the loser of a race sees once the winner has committed.
      ledger = [makeReturn({ items: [{ ...makeReturn().items[0], quantity: 3 }] })];

      await expect(
        service.createReturn(USER_ID, ORDER_ID, { items: [{ orderItemId: LINE_ID, quantity: 1 }] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('counts units already claimed by earlier returns', async () => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder());
      ledger = [makeReturn({ items: [{ ...makeReturn().items[0], quantity: 2 }] })];

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
      ledger = [
        makeReturn({
          status: ReturnStatus.REJECTED,
          items: [{ ...makeReturn().items[0], quantity: 3 }],
        }),
      ];

      await expect(
        service.createReturn(USER_ID, ORDER_ID, { items: [{ orderItemId: LINE_ID, quantity: 3 }] }),
      ).resolves.toBeInstanceOf(ReturnEntity);
    });

    it.each([ReturnStatus.REQUESTED, ReturnStatus.APPROVED, ReturnStatus.RECEIVED])(
      'keeps the units of a %s return claimed',
      async (status) => {
        orderRepositoryMock.findById.mockResolvedValue(makeOrder());
        ledger = [makeReturn({ status, items: [{ ...makeReturn().items[0], quantity: 3 }] })];

        await expect(
          service.createReturn(USER_ID, ORDER_ID, {
            items: [{ orderItemId: LINE_ID, quantity: 1 }],
          }),
        ).rejects.toThrow(BadRequestException);
      },
    );
  });

  // ─── createGuestReturn (TASK-1965) ──────────────────────────────────────────
  // The order id arrives already proven by its access token (the controller
  // resolves it through OrderService.resolveGuestOrderId). Everything else is
  // the customer door: same shipped-only rule, same lines, same locked cap, the
  // same shop ping — only the author (nobody) and the channel differ.

  describe('createGuestReturn', () => {
    const dto = { items: [{ orderItemId: LINE_ID, quantity: 1 }] };

    it('opens it through the GUEST_LINK channel with no author', async () => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder({ userId: null }));

      const result = await service.createGuestReturn(ORDER_ID, {
        ...dto,
        requestedOutcome: ReturnOutcome.REPAIR,
      });

      expect(result).toBeInstanceOf(ReturnEntity);
      expect(orderRepositoryMock.findById).toHaveBeenCalledWith(ORDER_ID);
      expect(returnRepositoryMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: ORDER_ID,
          items: dto.items,
          createdByUserId: null,
          requestedOutcome: ReturnOutcome.REPAIR,
          channel: ReturnChannel.GUEST_LINK,
        }),
        expect.any(Function),
        expect.any(Function),
      );
    });

    it('does not ask whose order it is — a phone order for an account holds a token too', async () => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder({ userId: OTHER_USER_ID }));

      await expect(service.createGuestReturn(ORDER_ID, dto)).resolves.toBeInstanceOf(ReturnEntity);
    });

    it("queues the same shop ping as the customer's door, in the return's transaction", async () => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder({ userId: null }));

      await service.createGuestReturn(ORDER_ID, dto);

      expect(shopNotifierMock.enqueueReturnRequested).toHaveBeenCalledWith(
        { returnId: RETURN_ID, orderId: ORDER_ID, itemsCount: 1, reason: 'Not the right size' },
        txMock,
      );
    });

    it('answers with the customer projection — no operator notes, no author', async () => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder({ userId: null }));
      returnRepositoryMock.create.mockResolvedValue(
        makeReturn({ createdByUserId: null, operatorNotes: 'internal' }),
      );

      const result = await service.createGuestReturn(ORDER_ID, dto);

      expect(result).not.toHaveProperty('operatorNotes');
      expect(result).not.toHaveProperty('createdByUserId');
    });

    it('refuses an order that has not shipped', async () => {
      orderRepositoryMock.findById.mockResolvedValue(
        makeOrder({ userId: null, status: OrderStatus.PROCESSING }),
      );

      await expect(service.createGuestReturn(ORDER_ID, dto)).rejects.toThrow(BadRequestException);
      expect(returnRepositoryMock.create).not.toHaveBeenCalled();
    });

    it('holds the same locked cap over earlier returns', async () => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder({ userId: null }));
      ledger = [makeReturn({ items: [{ ...makeReturn().items[0], quantity: 3 }] })];

      await expect(service.createGuestReturn(ORDER_ID, dto)).rejects.toThrow(BadRequestException);
      expect(inserted).toHaveLength(0);
    });

    it('404s when the order vanished between the token check and the write', async () => {
      orderRepositoryMock.findById.mockResolvedValue(null);

      await expect(service.createGuestReturn(ORDER_ID, dto)).rejects.toThrow(NotFoundException);
      expect(returnRepositoryMock.create).not.toHaveBeenCalled();
    });
  });

  describe('getGuestOrderReturns (TASK-1965)', () => {
    it('reads the customer projection of every return on the order', async () => {
      returnRepositoryMock.findByOrderId.mockResolvedValue([
        makeReturn({ operatorNotes: 'internal', createdByUserId: 'operator-uuid-1' }),
      ]);

      const [entity] = await service.getGuestOrderReturns(ORDER_ID);

      // The customer read: no admin joins, so no staff account is even loaded.
      expect(returnRepositoryMock.findByOrderId).toHaveBeenCalledWith(ORDER_ID);
      expect(entity).toBeInstanceOf(ReturnEntity);
      expect(entity).not.toHaveProperty('operatorNotes');
      expect(entity).not.toHaveProperty('createdByUserId');
    });
  });

  // ─── adminCreateReturn (TASK-469) ───────────────────────────────────────────

  describe('adminCreateReturn', () => {
    const OPERATOR_ID = 'operator-uuid-1';
    const dto = { items: [{ orderItemId: LINE_ID, quantity: 1 }] };

    // The whole reason this door exists: the customer door is scoped by
    // `order.userId !== userId`, and on a guest or phone order there IS no
    // userId, so it can never open. Half the shop's orders were unreturnable.
    it('opens a return against a GUEST order, which the customer door can never do', async () => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder({ userId: null }));

      await expect(service.adminCreateReturn(OPERATOR_ID, ORDER_ID, dto)).resolves.toBeInstanceOf(
        ReturnEntity,
      );
      expect(returnRepositoryMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ orderId: ORDER_ID, createdByUserId: OPERATOR_ID }),
        expect.any(Function),
      );
    });

    it('never pings the shop and hands the repository no hook — staff opened it (TASK-677)', async () => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder());

      await service.adminCreateReturn(OPERATOR_ID, ORDER_ID, dto);

      expect(returnRepositoryMock.create.mock.calls[0]).toHaveLength(2);
      expect(shopNotifierMock.enqueueReturnRequested).not.toHaveBeenCalled();
    });

    it('records the OPERATOR as the author, not the customer whose order it is', async () => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder());

      await service.adminCreateReturn(OPERATOR_ID, ORDER_ID, dto);

      expect(returnRepositoryMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ createdByUserId: OPERATOR_ID }),
        expect.any(Function),
      );
    });

    // TASK-1963: "the operator wrote it down" reads differently from "the
    // customer said", to both sides — so the door is recorded, not inferred.
    it('records the OPERATOR channel and the outcome the customer asked for', async () => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder({ userId: null }));

      await service.adminCreateReturn(OPERATOR_ID, ORDER_ID, {
        ...dto,
        requestedOutcome: ReturnOutcome.REPAIR,
      });

      expect(returnRepositoryMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: ReturnChannel.OPERATOR,
          requestedOutcome: ReturnOutcome.REPAIR,
          createdByUserId: OPERATOR_ID,
        }),
        expect.any(Function),
      );
    });

    // TASK-1963: opening a return is paperwork about goods, not a verdict on the
    // order. The order's lifecycle and its money move only through their own
    // doors (the decision, PATCH and the payment flow).
    it('never changes the order status or payment status', async () => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder());

      await service.adminCreateReturn(OPERATOR_ID, ORDER_ID, {
        ...dto,
        requestedOutcome: ReturnOutcome.REFUND,
      });

      expect(orderRepositoryMock.updateStatus).not.toHaveBeenCalled();
      expect(orderRepositoryMock.updatePaymentStatus).not.toHaveBeenCalled();
      expect(orderRepositoryMock.cancelAndRestock).not.toHaveBeenCalled();
      expect(orderRepositoryMock.updateDetails).not.toHaveBeenCalled();
      expect(orderRepositoryMock.applyPaymentOutcome).not.toHaveBeenCalled();
      const params = returnRepositoryMock.create.mock.calls[0][0] as Record<string, unknown>;
      expect(params).not.toHaveProperty('status');
      expect(params).not.toHaveProperty('paymentStatus');
    });

    it('404s on an order that does not exist', async () => {
      orderRepositoryMock.findById.mockResolvedValue(null);

      await expect(service.adminCreateReturn(OPERATOR_ID, ORDER_ID, dto)).rejects.toThrow(
        NotFoundException,
      );
      expect(returnRepositoryMock.create).not.toHaveBeenCalled();
    });

    // Acting FOR a customer is not permission to break the customer's rules —
    // the three checks below are the same ones the customer path runs, and a
    // divergence between the doors would show up first as stock credited back
    // for goods nobody bought.
    it.each([OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PROCESSING])(
      'refuses a return on a %s order, exactly as the customer door does',
      async (status) => {
        orderRepositoryMock.findById.mockResolvedValue(makeOrder({ status }));

        await expect(service.adminCreateReturn(OPERATOR_ID, ORDER_ID, dto)).rejects.toThrow(
          BadRequestException,
        );
      },
    );

    it('refuses a line that is not part of this order', async () => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder());

      await expect(
        service.adminCreateReturn(OPERATOR_ID, ORDER_ID, {
          items: [{ orderItemId: 'someone-elses-line', quantity: 1 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("runs the same cap inside the repository's locked write (TASK-784)", async () => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder({ userId: null }));

      await service.adminCreateReturn(OPERATOR_ID, ORDER_ID, dto);

      expect(returnRepositoryMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ orderId: ORDER_ID }),
        expect.any(Function),
      );
      expect(returnRepositoryMock.findByOrderId).not.toHaveBeenCalled();
    });

    it('refuses more units than remain returnable', async () => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder());
      ledger = [makeReturn({ items: [{ ...makeReturn().items[0], quantity: 2 }] })];

      await expect(
        service.adminCreateReturn(OPERATOR_ID, ORDER_ID, {
          items: [{ orderItemId: LINE_ID, quantity: 2 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    // ── The cap is over the request's OWN sum, not per element ────────────────
    // A repeated `orderItemId` used to be checked twice against the same
    // "already claimed" number, so two lines of 2 both passed 0+2 ≤ 3 and the
    // return held 4 units of a 3-unit line. Resolving that as RECEIVED with
    // `restock` loops the return's items and credits stock per row: the shop
    // invents a unit it never got back, then sells it. Guarded here rather than
    // in the DTO so both doors inherit it from one place (review of plan 180).

    it('sums a repeated line instead of checking each entry on its own', async () => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder());

      await expect(
        service.adminCreateReturn(OPERATOR_ID, ORDER_ID, {
          items: [
            { orderItemId: LINE_ID, quantity: 2 },
            { orderItemId: LINE_ID, quantity: 2 },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
      // The check now runs inside the repository's transaction, so `create` is
      // entered — what matters is that nothing was written (TASK-784).
      expect(inserted).toHaveLength(0);
    });

    it('still accepts a repeated line whose SUM fits inside what was bought', async () => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder());

      await expect(
        service.adminCreateReturn(OPERATOR_ID, ORDER_ID, {
          items: [
            { orderItemId: LINE_ID, quantity: 2 },
            { orderItemId: LINE_ID, quantity: 1 },
          ],
        }),
      ).resolves.toBeInstanceOf(ReturnEntity);
    });

    it('answers with the internal fields — this response is read by an operator', async () => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder());
      returnRepositoryMock.create.mockResolvedValue(
        makeReturn({ operatorNotes: 'called the customer', createdByUserId: OPERATOR_ID }),
      );

      const result = await service.adminCreateReturn(OPERATOR_ID, ORDER_ID, dto);

      expect(result.operatorNotes).toBe('called the customer');
      expect(result.createdByUserId).toBe(OPERATOR_ID);
    });
  });

  describe('adminGetOrderReturns', () => {
    it('answers for an order with no owner at all — the question the customer twin cannot', async () => {
      returnRepositoryMock.findByOrderId.mockResolvedValue([makeReturn()]);

      const result = await service.adminGetOrderReturns(ORDER_ID);

      expect(result).toHaveLength(1);
      // The admin read, with the authors joined for the operator (TASK-1963).
      expect(returnRepositoryMock.findByOrderId).toHaveBeenCalledWith(ORDER_ID, { admin: true });
      // No ownership read: there is nobody to compare against.
      expect(orderRepositoryMock.findById).not.toHaveBeenCalled();
    });

    it('is empty when nothing has been opened — the signal the REFUNDED dialog reads', async () => {
      returnRepositoryMock.findByOrderId.mockResolvedValue([]);

      await expect(service.adminGetOrderReturns(ORDER_ID)).resolves.toEqual([]);
    });
  });

  describe('getOrderReturns (customer)', () => {
    // TASK-1963: the customer read never even LOADS staff accounts — the
    // projection strips them too, but what was never read cannot leak.
    it('asks the repository for the customer read, without the admin joins', async () => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder());
      returnRepositoryMock.findByOrderId.mockResolvedValue([makeReturn()]);

      const [entity] = await service.getOrderReturns(USER_ID, ORDER_ID);

      expect(returnRepositoryMock.findByOrderId).toHaveBeenCalledWith(ORDER_ID);
      expect(entity).not.toHaveProperty('createdBy');
      expect(entity).not.toHaveProperty('decidedById');
    });
  });

  // ─── getMyReturns (TASK-608) ────────────────────────────────────────────────

  describe('getMyReturns', () => {
    it("reads the caller's returns across their orders, capped", async () => {
      returnRepositoryMock.findByUserId.mockResolvedValue([makeReturn()]);

      const result = await service.getMyReturns(USER_ID);

      expect(returnRepositoryMock.findByUserId).toHaveBeenCalledWith(USER_ID, MY_RETURNS_LIMIT);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ orderId: ORDER_ID, status: ReturnStatus.REQUESTED });
    });

    it('answers with the customer projection — no operator notes, no author id', async () => {
      returnRepositoryMock.findByUserId.mockResolvedValue([
        makeReturn({ operatorNotes: 'Клієнт сварився' }),
      ]);

      const [entity] = await service.getMyReturns(USER_ID);

      expect(entity).not.toHaveProperty('operatorNotes');
      expect(entity).not.toHaveProperty('createdByUserId');
    });

    it('is empty for a customer who never asked for a return', async () => {
      returnRepositoryMock.findByUserId.mockResolvedValue([]);

      await expect(service.getMyReturns(OTHER_USER_ID)).resolves.toEqual([]);
    });
  });

  // ─── resolveReturn ──────────────────────────────────────────────────────────

  describe('resolveReturn', () => {
    /** Whatever else the basis carries, it names this return. */
    const RESOLVE_BASIS: unknown = expect.objectContaining({ id: RETURN_ID });

    beforeEach(() => {
      returnRepositoryMock.resolve.mockImplementation(
        (_current: unknown, fields: { status: string }) =>
          Promise.resolve(makeReturn({ status: fields.status as ReturnStatus })),
      );
    });

    it('records the goods arriving and stamps the resolution time', async () => {
      returnRepositoryMock.findById.mockResolvedValue(
        makeReturn({ status: ReturnStatus.APPROVED, decision: ReturnDecision.REFUND }),
      );

      await service.resolveReturn(RETURN_ID, { status: ReturnStatus.RECEIVED });

      expect(returnRepositoryMock.resolve).toHaveBeenCalledWith(
        RESOLVE_BASIS,
        expect.objectContaining({ status: ReturnStatus.RECEIVED, resolvedAt: expect.any(Date) }),
        { restock: false },
      );
    });

    // The service validates against a read taken OUTSIDE the write; the
    // repository makes the write conditional on exactly what was validated, so a
    // decision committed in between is never overwritten (TASK-1961/2044).
    it('hands the repository the status and decision it validated the move against', async () => {
      returnRepositoryMock.findById.mockResolvedValue(
        makeReturn({ status: ReturnStatus.RECEIVED, decision: ReturnDecision.REFUND }),
      );

      await service.resolveReturn(RETURN_ID, { status: ReturnStatus.REFUNDED });

      expect(returnRepositoryMock.resolve).toHaveBeenCalledWith(
        {
          id: RETURN_ID,
          orderId: ORDER_ID,
          status: ReturnStatus.RECEIVED,
          decision: ReturnDecision.REFUND,
        },
        expect.anything(),
        { restock: false },
      );
    });

    // TASK-1961/2044: approving and refusing are DECISIONS now — with an author,
    // a reason the customer sees and a history row. PATCH setting them directly
    // would be a way round all three.
    it.each([ReturnStatus.APPROVED, ReturnStatus.REJECTED])(
      'refuses to set %s — 400 RETURN_USE_DECISION_ENDPOINT, writing nothing',
      async (status) => {
        returnRepositoryMock.findById.mockResolvedValue(makeReturn());

        const caught = (await service
          .resolveReturn(RETURN_ID, { status })
          .catch((error: unknown) => error)) as HttpException;

        expect(caught).toBeInstanceOf(BadRequestException);
        expect(caught.getResponse()).toMatchObject({ error: 'RETURN_USE_DECISION_ENDPOINT' });
        expect(returnRepositoryMock.resolve).not.toHaveBeenCalled();
      },
    );

    it.each([ReturnDecision.REPLACEMENT, ReturnDecision.REPAIR])(
      'refuses to pay money out on a %s decision — 409 RETURN_TRANSITION_INVALID',
      async (decision) => {
        returnRepositoryMock.findById.mockResolvedValue(
          makeReturn({ status: ReturnStatus.RECEIVED, decision }),
        );

        const caught = (await service
          .resolveReturn(RETURN_ID, { status: ReturnStatus.REFUNDED })
          .catch((error: unknown) => error)) as HttpException;

        expect(caught).toBeInstanceOf(ConflictException);
        expect(caught.getResponse()).toMatchObject({ error: 'RETURN_TRANSITION_INVALID' });
        expect(returnRepositoryMock.resolve).not.toHaveBeenCalled();
      },
    );

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
        service.resolveReturn('missing', { status: ReturnStatus.RECEIVED }),
      ).rejects.toThrow(NotFoundException);
    });

    it('exposes operatorNotes on the admin response', async () => {
      returnRepositoryMock.findById.mockResolvedValue(
        makeReturn({ status: ReturnStatus.APPROVED, decision: ReturnDecision.REFUND }),
      );
      returnRepositoryMock.resolve.mockResolvedValue(
        makeReturn({ status: ReturnStatus.RECEIVED, operatorNotes: 'Refund via card' }),
      );

      const result = await service.resolveReturn(RETURN_ID, {
        status: ReturnStatus.RECEIVED,
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

        expect(returnRepositoryMock.resolve).toHaveBeenCalledWith(
          RESOLVE_BASIS,
          expect.anything(),
          {
            restock: true,
          },
        );
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
        returnRepositoryMock.findById.mockResolvedValue(
          makeReturn({ status: ReturnStatus.RECEIVED, decision: ReturnDecision.REFUND }),
        );

        await expect(
          service.resolveReturn(RETURN_ID, { status: ReturnStatus.REFUNDED, restock: true }),
        ).rejects.toThrow(BadRequestException);
      });

      it('does not restock unless asked — arriving is not the same as being sellable', async () => {
        returnRepositoryMock.findById.mockResolvedValue(
          makeReturn({ status: ReturnStatus.APPROVED }),
        );

        await service.resolveReturn(RETURN_ID, { status: ReturnStatus.RECEIVED });

        // Goods can come back broken, opened, or not ours at all. Only the
        // operator can see which.
        expect(returnRepositoryMock.resolve).toHaveBeenCalledWith(
          RESOLVE_BASIS,
          expect.anything(),
          {
            restock: false,
          },
        );
      });

      it('never restocks on the refund step (the goods came back at RECEIVED)', async () => {
        returnRepositoryMock.findById.mockResolvedValue(
          makeReturn({
            status: ReturnStatus.RECEIVED,
            decision: ReturnDecision.REFUND,
            restockedAt: new Date(),
          }),
        );

        await service.resolveReturn(RETURN_ID, { status: ReturnStatus.REFUNDED });

        expect(returnRepositoryMock.resolve).toHaveBeenCalledWith(
          RESOLVE_BASIS,
          expect.anything(),
          {
            restock: false,
          },
        );
      });
    });

    // ── The refund ceilings (TASK-785) ──────────────────────────────────────────
    //
    // `refundedAmount` used to be checked for SHAPE only, so "49900" typed for
    // "499.00" was accepted, summed into the order's `refundedTotal` and reported
    // by B-8 as money that had gone back. Two ceilings now, both checked by the
    // repository inside the resolve transaction, against a ledger read under a
    // lock on the order row — the same shape as the quantity cap of TASK-784.

    describe('refund ceilings (TASK-785)', () => {
      /** What the repository reads under the lock and hands the service's check. */
      let refundLedger: {
        orderTotal: { toString(): string };
        otherRefunds: Array<{ refundedAmount: { toString(): string } | null }>;
        items: Array<{ quantity: number; unitPrice: { toString(): string } }>;
      };
      /** Only the resolves whose check passed — what the mocked repository "wrote". */
      let written: unknown[];

      const money = (value: string) => ({ toString: () => value });

      beforeEach(() => {
        written = [];
        // Order of three at 499.00, nothing refunded yet; this return holds one unit.
        refundLedger = {
          orderTotal: money('1497.00'),
          otherRefunds: [],
          items: [{ quantity: 1, unitPrice: money('499.00') }],
        };
        returnRepositoryMock.findById.mockResolvedValue(
          makeReturn({ status: ReturnStatus.RECEIVED, decision: ReturnDecision.REFUND }),
        );
        returnRepositoryMock.resolve.mockImplementation(
          async (
            _id: string,
            fields: { status: string },
            options?: { assertRefundable?: (ledger: typeof refundLedger) => void },
          ) => {
            options?.assertRefundable?.(refundLedger);
            written.push(fields);
            return makeReturn({ status: fields.status as ReturnStatus });
          },
        );
      });

      const refund = (refundedAmount: string | null) =>
        service.resolveReturn(RETURN_ID, { status: ReturnStatus.REFUNDED, refundedAmount });

      /** The `{ error, message }` body the exception carries to the wire. */
      const bodyOf = async (promise: Promise<unknown>) => {
        const error = await promise.then(
          () => {
            throw new Error('expected a refusal');
          },
          (caught: unknown) => caught,
        );
        expect(error).toBeInstanceOf(BadRequestException);
        return (error as BadRequestException).getResponse() as { error: string; message: string };
      };

      it('accepts a refund of exactly the value of the returned lines', async () => {
        await refund('499.00');

        expect(written).toHaveLength(1);
      });

      it('accepts a partial refund — shipping is not always refundable', async () => {
        await refund('450.50');

        expect(written).toHaveLength(1);
      });

      it('refuses "49900" typed for "499.00" — more than the returned lines are worth', async () => {
        const body = await bodyOf(refund('49900'));

        expect(body.error).toBe('RETURN_REFUND_EXCEEDS_RETURNED_VALUE');
        expect(body.message).toContain('499.00');
        expect(written).toHaveLength(0);
      });

      it('refuses even one kopiyka over the returned value', async () => {
        const body = await bodyOf(refund('499.01'));

        expect(body.error).toBe('RETURN_REFUND_EXCEEDS_RETURNED_VALUE');
        expect(written).toHaveLength(0);
      });

      it('values the returned lines at unit price × returned quantity', async () => {
        refundLedger.items = [
          { quantity: 2, unitPrice: money('499.00') },
          { quantity: 1, unitPrice: money('0.10') },
        ];

        await refund('998.10');
        expect(written).toHaveLength(1);

        const body = await bodyOf(refund('998.11'));
        expect(body.error).toBe('RETURN_REFUND_EXCEEDS_RETURNED_VALUE');
      });

      it('refuses more than the order has left once earlier returns were paid out', async () => {
        // 1497.00 paid, 1200.00 already back through other returns: 297.00 left,
        // although the unit on THIS return is worth 499.00.
        refundLedger.otherRefunds = [
          { refundedAmount: money('700.00') },
          { refundedAmount: money('500.00') },
        ];

        const body = await bodyOf(refund('499.00'));

        expect(body.error).toBe('RETURN_REFUND_EXCEEDS_ORDER_BALANCE');
        expect(body.message).toContain('297.00');
        expect(written).toHaveLength(0);
      });

      it('accepts exactly what the order has left', async () => {
        refundLedger.otherRefunds = [{ refundedAmount: money('1200.00') }];

        await refund('297.00');

        expect(written).toHaveLength(1);
      });

      it('ignores other returns that have paid nothing out yet', async () => {
        refundLedger.otherRefunds = [{ refundedAmount: null }, { refundedAmount: null }];

        await refund('499.00');

        expect(written).toHaveLength(1);
      });

      it('caps by the order total, so a discounted order never refunds its gross price', async () => {
        // The discount is order-level, not allocated to lines: one 499.00 case
        // bought for 400.00 after a coupon. The line is worth 499.00 gross, but
        // only 400.00 was ever paid.
        refundLedger.orderTotal = money('400.00');

        const body = await bodyOf(refund('499.00'));
        expect(body.error).toBe('RETURN_REFUND_EXCEEDS_ORDER_BALANCE');

        await refund('400.00');
        expect(written).toHaveLength(1);
      });

      it('hands the check to the repository instead of deciding against its own earlier read', async () => {
        await refund('499.00');

        expect(returnRepositoryMock.resolve).toHaveBeenCalledWith(
          RESOLVE_BASIS,
          expect.objectContaining({ refundedAmount: '499.00' }),
          { restock: false, assertRefundable: expect.any(Function) },
        );
      });

      it('asks nothing when no amount is being recorded', async () => {
        await service.resolveReturn(RETURN_ID, { status: ReturnStatus.REFUNDED });

        expect(returnRepositoryMock.resolve).toHaveBeenCalledWith(
          RESOLVE_BASIS,
          expect.anything(),
          {
            restock: false,
          },
        );
      });

      it('lets an operator clear a mistyped amount — null is never over any ceiling', async () => {
        await refund(null);

        expect(returnRepositoryMock.resolve).toHaveBeenCalledWith(
          RESOLVE_BASIS,
          expect.objectContaining({ refundedAmount: null }),
          { restock: false },
        );
      });
    });

    // Approving and refusing moved to POST /decision (TASK-1961/2044), so a
    // PATCH carrying only the notes is the one way left to keep the operator's
    // notes on a request nobody has decided yet, or on a closed return.
    describe('notes only — no status', () => {
      beforeEach(() => {
        returnRepositoryMock.updateNotes.mockImplementation(
          (_id: string, operatorNotes: string | null) =>
            Promise.resolve(makeReturn({ operatorNotes })),
        );
      });

      it.each([
        ReturnStatus.REQUESTED,
        ReturnStatus.APPROVED,
        ReturnStatus.REJECTED,
        ReturnStatus.RECEIVED,
        ReturnStatus.REFUNDED,
      ])('saves the notes on a %s return without moving it', async (status) => {
        returnRepositoryMock.findById.mockResolvedValue(makeReturn({ status }));

        const result = await service.resolveReturn(RETURN_ID, { operatorNotes: 'Дзвонив клієнт' });

        expect(returnRepositoryMock.updateNotes).toHaveBeenCalledWith(RETURN_ID, 'Дзвонив клієнт');
        expect(returnRepositoryMock.resolve).not.toHaveBeenCalled();
        // The operator's own view: the notes come back in the answer.
        expect(result.operatorNotes).toBe('Дзвонив клієнт');
      });

      it('clears the notes when sent null', async () => {
        returnRepositoryMock.findById.mockResolvedValue(makeReturn());

        await service.resolveReturn(RETURN_ID, { operatorNotes: null });

        expect(returnRepositoryMock.updateNotes).toHaveBeenCalledWith(RETURN_ID, null);
      });

      it('404 RETURN_NOT_FOUND for a missing return, writing nothing', async () => {
        returnRepositoryMock.findById.mockResolvedValue(null);

        await expect(
          service.resolveReturn('missing', { operatorNotes: 'x' }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(returnRepositoryMock.updateNotes).not.toHaveBeenCalled();
      });

      it('400 RETURN_UPDATE_EMPTY when neither a status nor notes are sent', async () => {
        const caught = await service.resolveReturn(RETURN_ID, {}).catch((e: unknown) => e);

        expect(caught).toBeInstanceOf(BadRequestException);
        expect((caught as HttpException).getResponse()).toEqual({
          error: 'RETURN_UPDATE_EMPTY',
          message: 'Nothing to update — send a status, operatorNotes, or both',
        });
        expect(returnRepositoryMock.findById).not.toHaveBeenCalled();
      });

      it.each([
        ['refundedAmount', { operatorNotes: 'x', refundedAmount: '499.00' }],
        ['restock', { operatorNotes: 'x', restock: true }],
        ['restock: false', { restock: false }],
      ])('400 RETURN_STATUS_REQUIRED for %s without a status', async (_name, dto) => {
        const caught = await service.resolveReturn(RETURN_ID, dto).catch((e: unknown) => e);

        expect(caught).toBeInstanceOf(BadRequestException);
        expect((caught as HttpException).getResponse()).toEqual({
          error: 'RETURN_STATUS_REQUIRED',
          message: 'refundedAmount and restock move a return on — send them with a status',
        });
        expect(returnRepositoryMock.updateNotes).not.toHaveBeenCalled();
        expect(returnRepositoryMock.resolve).not.toHaveBeenCalled();
      });

      it('logs the notes change as its own event, not as a resolution', async () => {
        returnRepositoryMock.findById.mockResolvedValue(makeReturn());

        await service.resolveReturn(RETURN_ID, { operatorNotes: 'x' });

        expect(pinoLoggerMock.info).toHaveBeenCalledWith(
          expect.objectContaining({ event: 'return.notesUpdated', returnId: RETURN_ID }),
          expect.any(String),
        );
        expect(pinoLoggerMock.info).not.toHaveBeenCalledWith(
          expect.objectContaining({ event: 'return.resolved' }),
          expect.anything(),
        );
      });
    });
  });

  // ─── Stable error codes (TASK-1966) ─────────────────────────────────────────
  //
  // The admin panel used to receive a bare English sentence for every refusal
  // here and could only show "try again" — a double request and an exhausted
  // line looked the same. Every throw now carries `{ error: CODE, message }`
  // (the `order.errors.ts` pattern). The HTTP status and the English message are
  // pinned too: the status is part of the contract, and the message is what the
  // storefront and older admin builds still render.

  describe('error codes (TASK-1966)', () => {
    /** The exception a call was refused with, failing the test if it resolved. */
    const refusalOf = async (promise: Promise<unknown>) => {
      const caught = await promise.then(
        () => {
          throw new Error('expected a refusal');
        },
        (error: unknown) => error,
      );
      expect(caught).toBeInstanceOf(HttpException);
      const exception = caught as HttpException;
      return {
        status: exception.getStatus(),
        body: exception.getResponse() as { error: string; message: string },
      };
    };

    const dto = { items: [{ orderItemId: LINE_ID, quantity: 1 }] };

    it.each([
      ['createReturn', () => service.createReturn(USER_ID, ORDER_ID, dto)],
      ['adminCreateReturn', () => service.adminCreateReturn('operator-uuid-1', ORDER_ID, dto)],
      ['getOrderReturns', () => service.getOrderReturns(USER_ID, ORDER_ID)],
    ])('%s: 404 RETURN_ORDER_NOT_FOUND for a missing order', async (_name, call) => {
      orderRepositoryMock.findById.mockResolvedValue(null);

      expect(await refusalOf(call())).toEqual({
        status: 404,
        body: { error: 'RETURN_ORDER_NOT_FOUND', message: 'Order not found' },
      });
    });

    it("404 RETURN_ORDER_NOT_FOUND for someone else's order — same body as a missing one", async () => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder({ userId: OTHER_USER_ID }));

      expect(await refusalOf(service.createReturn(USER_ID, ORDER_ID, dto))).toEqual({
        status: 404,
        body: { error: 'RETURN_ORDER_NOT_FOUND', message: 'Order not found' },
      });
    });

    it.each([
      ['adminGetReturn', () => service.adminGetReturn('missing')],
      ['resolveReturn', () => service.resolveReturn('missing', { status: ReturnStatus.RECEIVED })],
      [
        'decideReturn',
        () =>
          service.decideReturn('missing', 'operator-uuid-1', { decision: ReturnDecision.REFUND }),
      ],
    ])('%s: 404 RETURN_NOT_FOUND for a missing return', async (_name, call) => {
      returnRepositoryMock.findById.mockResolvedValue(null);

      expect(await refusalOf(call())).toEqual({
        status: 404,
        body: { error: 'RETURN_NOT_FOUND', message: 'Return not found' },
      });
    });

    it('400 RETURN_ORDER_NOT_RETURNABLE for an order that has not shipped', async () => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder({ status: OrderStatus.PROCESSING }));

      expect(await refusalOf(service.createReturn(USER_ID, ORDER_ID, dto))).toEqual({
        status: 400,
        body: {
          error: 'RETURN_ORDER_NOT_RETURNABLE',
          message: 'Only shipped or delivered orders can be returned — cancel the order instead',
        },
      });
    });

    it('400 RETURN_ITEM_NOT_IN_ORDER for a line of another order', async () => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder());

      const refusal = await refusalOf(
        service.adminCreateReturn('operator-uuid-1', ORDER_ID, {
          items: [{ orderItemId: 'someone-elses-line', quantity: 1 }],
        }),
      );

      expect(refusal).toEqual({
        status: 400,
        body: { error: 'RETURN_ITEM_NOT_IN_ORDER', message: 'That item is not part of this order' },
      });
    });

    it('400 RETURN_QUANTITY_EXCEEDED, naming how many units remain returnable', async () => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder());
      // All three bought are already claimed by a live return.
      ledger = [makeReturn({ items: [{ ...makeReturn().items[0], quantity: 3 }] })];

      expect(await refusalOf(service.createReturn(USER_ID, ORDER_ID, dto))).toEqual({
        status: 400,
        body: {
          error: 'RETURN_QUANTITY_EXCEEDED',
          message: 'Cannot return 1 of that item — 0 remain returnable',
        },
      });
    });

    it('409 RETURN_TRANSITION_INVALID, naming both ends of the forbidden move', async () => {
      returnRepositoryMock.findById.mockResolvedValue(makeReturn());

      expect(
        await refusalOf(service.resolveReturn(RETURN_ID, { status: ReturnStatus.REFUNDED })),
      ).toEqual({
        status: 409,
        body: {
          error: 'RETURN_TRANSITION_INVALID',
          message: 'A return cannot move from REQUESTED to REFUNDED',
        },
      });
    });

    it('400 RETURN_RESTOCK_REQUIRES_RECEIVED for a restock on any other status', async () => {
      returnRepositoryMock.findById.mockResolvedValue(
        makeReturn({ status: ReturnStatus.RECEIVED, decision: ReturnDecision.REFUND }),
      );

      expect(
        await refusalOf(
          service.resolveReturn(RETURN_ID, { status: ReturnStatus.REFUNDED, restock: true }),
        ),
      ).toEqual({
        status: 400,
        body: {
          error: 'RETURN_RESTOCK_REQUIRES_RECEIVED',
          message: 'Stock is credited back when a return is marked RECEIVED, not REFUNDED',
        },
      });
    });

    it('409 RETURN_ALREADY_RESTOCKED for goods already credited back', async () => {
      returnRepositoryMock.findById.mockResolvedValue(
        makeReturn({ status: ReturnStatus.APPROVED, restockedAt: new Date() }),
      );

      expect(
        await refusalOf(
          service.resolveReturn(RETURN_ID, { status: ReturnStatus.RECEIVED, restock: true }),
        ),
      ).toEqual({
        status: 409,
        body: {
          error: 'RETURN_ALREADY_RESTOCKED',
          message: 'These returned goods have already been credited back to inventory',
        },
      });
    });
  });

  // ─── decideReturn (TASK-1961, TASK-2044) ─────────────────────────────────────
  //
  // One request, several possible outcomes: refund, replacement, repair or
  // refusal — each with an author, a date and a reason the customer sees. A
  // refusal without a reason, or a silent change of an earlier decision, is
  // exactly what B-12 decided the shop must not be able to do.

  describe('decideReturn (TASK-1961, TASK-2044)', () => {
    const OPERATOR_ID = 'operator-uuid-1';

    /** Other returns of the order, as the repository reads them under the lock. */
    let decideLedger: ReturnWithItems[];
    /** What the mocked repository wrote — only decisions whose check passed. */
    let decided: Array<{ current: unknown; change: Record<string, unknown> }>;

    beforeEach(() => {
      decideLedger = [];
      decided = [];
      returnRepositoryMock.decide.mockImplementation(
        async (
          current: unknown,
          change: Record<string, unknown>,
          options?: { assertClaimable?: (rows: ReturnWithItems[]) => void },
        ) => {
          options?.assertClaimable?.(decideLedger);
          decided.push({ current, change });
          return makeReturn(change as Partial<ReturnWithItems>);
        },
      );
    });

    const refusal = async (promise: Promise<unknown>) => {
      const caught = (await promise.then(
        () => {
          throw new Error('expected a refusal');
        },
        (error: unknown) => error,
      )) as HttpException;
      expect(caught).toBeInstanceOf(HttpException);
      return {
        status: caught.getStatus(),
        body: caught.getResponse() as { error: string; message: string },
      };
    };

    describe('a first decision on a fresh request', () => {
      it.each([ReturnDecision.REFUND, ReturnDecision.REPLACEMENT, ReturnDecision.REPAIR])(
        '%s approves it — no reason needed for a yes',
        async (decision) => {
          returnRepositoryMock.findById.mockResolvedValue(makeReturn());

          await service.decideReturn(RETURN_ID, OPERATOR_ID, { decision });

          expect(decided).toHaveLength(1);
          expect(decided[0].change).toEqual({
            status: ReturnStatus.APPROVED,
            decision,
            decisionReason: null,
            decidedById: OPERATOR_ID,
            decidedAt: expect.any(Date),
          });
        },
      );

      it('records the operator from the actor, not from the request body', async () => {
        returnRepositoryMock.findById.mockResolvedValue(makeReturn());

        await service.decideReturn(RETURN_ID, OPERATOR_ID, {
          decision: ReturnDecision.REFUND,
          reason: 'Брак підтверджено',
        });

        expect(decided[0].change).toMatchObject({
          decidedById: OPERATOR_ID,
          decisionReason: 'Брак підтверджено',
        });
      });

      it('hands the repository the state it decided against, for its concurrency guard', async () => {
        returnRepositoryMock.findById.mockResolvedValue(makeReturn());

        await service.decideReturn(RETURN_ID, OPERATOR_ID, { decision: ReturnDecision.REFUND });

        expect(decided[0].current).toEqual({
          id: RETURN_ID,
          orderId: ORDER_ID,
          status: ReturnStatus.REQUESTED,
          decision: null,
        });
      });

      it('answers with the admin projection, decision and author included', async () => {
        returnRepositoryMock.findById.mockResolvedValue(makeReturn());

        const result = await service.decideReturn(RETURN_ID, OPERATOR_ID, {
          decision: ReturnDecision.REPAIR,
        });

        expect(result).toBeInstanceOf(ReturnEntity);
        expect(result).toMatchObject({
          status: ReturnStatus.APPROVED,
          decision: ReturnDecision.REPAIR,
          decidedById: OPERATOR_ID,
        });
      });
    });

    describe('the reason rule', () => {
      it('400 RETURN_DECISION_REASON_REQUIRED for a refusal without a reason, writing nothing', async () => {
        returnRepositoryMock.findById.mockResolvedValue(makeReturn());

        const result = await refusal(
          service.decideReturn(RETURN_ID, OPERATOR_ID, { decision: ReturnDecision.REJECT }),
        );

        expect(result.status).toBe(400);
        expect(result.body.error).toBe('RETURN_DECISION_REASON_REQUIRED');
        expect(returnRepositoryMock.decide).not.toHaveBeenCalled();
      });

      it('treats a null reason (a blank one, after the DTO trims it) as no reason', async () => {
        returnRepositoryMock.findById.mockResolvedValue(makeReturn());

        const result = await refusal(
          service.decideReturn(RETURN_ID, OPERATOR_ID, {
            decision: ReturnDecision.REJECT,
            reason: null,
          }),
        );

        expect(result.body.error).toBe('RETURN_DECISION_REASON_REQUIRED');
      });

      it('requires a reason to CHANGE a decision already made', async () => {
        returnRepositoryMock.findById.mockResolvedValue(
          makeReturn({ status: ReturnStatus.APPROVED, decision: ReturnDecision.REPAIR }),
        );

        const result = await refusal(
          service.decideReturn(RETURN_ID, OPERATOR_ID, { decision: ReturnDecision.REFUND }),
        );

        expect(result.status).toBe(400);
        expect(result.body.error).toBe('RETURN_DECISION_REASON_REQUIRED');
        expect(returnRepositoryMock.decide).not.toHaveBeenCalled();
      });

      it('counts a backfilled (legacy) decision as one already made', async () => {
        // R1 backfill: an APPROVED row before B-12 became decision = REFUND.
        returnRepositoryMock.findById.mockResolvedValue(
          makeReturn({ status: ReturnStatus.APPROVED, decision: ReturnDecision.REFUND }),
        );

        const result = await refusal(
          service.decideReturn(RETURN_ID, OPERATOR_ID, { decision: ReturnDecision.REPLACEMENT }),
        );

        expect(result.body.error).toBe('RETURN_DECISION_REASON_REQUIRED');
      });
    });

    describe('what cannot be decided', () => {
      it('409 RETURN_DECISION_LOCKED on a refunded return — money paid out is final', async () => {
        returnRepositoryMock.findById.mockResolvedValue(
          makeReturn({ status: ReturnStatus.REFUNDED, decision: ReturnDecision.REFUND }),
        );

        const result = await refusal(
          service.decideReturn(RETURN_ID, OPERATOR_ID, {
            decision: ReturnDecision.REJECT,
            reason: 'Передумали',
          }),
        );

        expect(result.status).toBe(409);
        expect(result.body.error).toBe('RETURN_DECISION_LOCKED');
        expect(returnRepositoryMock.decide).not.toHaveBeenCalled();
      });

      it('409 RETURN_DECISION_UNCHANGED for the same decision with the same reason', async () => {
        returnRepositoryMock.findById.mockResolvedValue(
          makeReturn({
            status: ReturnStatus.REJECTED,
            decision: ReturnDecision.REJECT,
            decisionReason: 'Сліди використання',
          }),
        );

        const result = await refusal(
          service.decideReturn(RETURN_ID, OPERATOR_ID, {
            decision: ReturnDecision.REJECT,
            reason: 'Сліди використання',
          }),
        );

        expect(result.status).toBe(409);
        expect(result.body.error).toBe('RETURN_DECISION_UNCHANGED');
        expect(returnRepositoryMock.decide).not.toHaveBeenCalled();
      });

      it('lets the same decision be re-worded — a new reason is a new history row', async () => {
        returnRepositoryMock.findById.mockResolvedValue(
          makeReturn({ status: ReturnStatus.REJECTED, decision: ReturnDecision.REJECT }),
        );

        await service.decideReturn(RETURN_ID, OPERATOR_ID, {
          decision: ReturnDecision.REJECT,
          reason: 'Сліди використання на корпусі',
        });

        expect(decided[0].change).toMatchObject({
          status: ReturnStatus.REJECTED,
          decision: ReturnDecision.REJECT,
          decisionReason: 'Сліди використання на корпусі',
        });
      });

      it('409 RETURN_TRANSITION_INVALID for refusing goods already received', async () => {
        returnRepositoryMock.findById.mockResolvedValue(
          makeReturn({ status: ReturnStatus.RECEIVED, decision: ReturnDecision.REFUND }),
        );

        const result = await refusal(
          service.decideReturn(RETURN_ID, OPERATOR_ID, {
            decision: ReturnDecision.REJECT,
            reason: 'Не наш товар',
          }),
        );

        expect(result).toEqual({
          status: 409,
          body: {
            error: 'RETURN_TRANSITION_INVALID',
            message: 'A return cannot move from RECEIVED to REJECTED',
          },
        });
        expect(returnRepositoryMock.decide).not.toHaveBeenCalled();
      });
    });

    describe('status effects', () => {
      it.each([ReturnStatus.REQUESTED, ReturnStatus.APPROVED])(
        'REJECT moves %s to REJECTED',
        async (status) => {
          returnRepositoryMock.findById.mockResolvedValue(
            makeReturn({
              status,
              decision: status === ReturnStatus.APPROVED ? ReturnDecision.REFUND : null,
            }),
          );

          await service.decideReturn(RETURN_ID, OPERATOR_ID, {
            decision: ReturnDecision.REJECT,
            reason: 'Пошкоджено покупцем',
          });

          expect(decided[0].change.status).toBe(ReturnStatus.REJECTED);
        },
      );

      it('a change of decision on RECEIVED goods keeps them RECEIVED', async () => {
        returnRepositoryMock.findById.mockResolvedValue(
          makeReturn({ status: ReturnStatus.RECEIVED, decision: ReturnDecision.REPAIR }),
        );

        await service.decideReturn(RETURN_ID, OPERATOR_ID, {
          decision: ReturnDecision.REFUND,
          reason: 'Не підлягає ремонту',
        });

        expect(decided[0].change.status).toBe(ReturnStatus.RECEIVED);
      });

      it('takes no claim check when the units were never released', async () => {
        returnRepositoryMock.findById.mockResolvedValue(makeReturn());

        await service.decideReturn(RETURN_ID, OPERATOR_ID, { decision: ReturnDecision.REFUND });

        expect(returnRepositoryMock.decide).toHaveBeenCalledWith(
          expect.anything(),
          expect.anything(),
          {},
        );
      });
    });

    // A REJECTED return releases its units (TASK-784), so the customer may have
    // filed a new request for them since. Re-opening the refusal claims them
    // back — and must not succeed if they are gone.
    describe('re-opening a refusal', () => {
      const rejected = () =>
        makeReturn({
          status: ReturnStatus.REJECTED,
          decision: ReturnDecision.REJECT,
          decisionReason: 'Немає чека',
          items: [{ ...makeReturn().items[0], quantity: 2 }],
        });

      it('approves it and re-claims its units under the lock', async () => {
        returnRepositoryMock.findById.mockResolvedValue(rejected());

        await service.decideReturn(RETURN_ID, OPERATOR_ID, {
          decision: ReturnDecision.REFUND,
          reason: 'Чек знайшовся',
        });

        expect(decided[0].change.status).toBe(ReturnStatus.APPROVED);
        expect(returnRepositoryMock.decide).toHaveBeenCalledWith(
          expect.anything(),
          expect.anything(),
          { assertClaimable: expect.any(Function) },
        );
      });

      it('fits exactly: 2 re-claimed + 1 held elsewhere = the 3 bought', async () => {
        returnRepositoryMock.findById.mockResolvedValue(rejected());
        decideLedger = [makeReturn({ id: 'other-return', status: ReturnStatus.APPROVED })];

        await service.decideReturn(RETURN_ID, OPERATOR_ID, {
          decision: ReturnDecision.REPAIR,
          reason: 'Чек знайшовся',
        });

        expect(decided).toHaveLength(1);
      });

      it('ignores other REJECTED returns — they hold nothing', async () => {
        returnRepositoryMock.findById.mockResolvedValue(rejected());
        decideLedger = [
          makeReturn({
            id: 'other-return',
            status: ReturnStatus.REJECTED,
            items: [{ ...makeReturn().items[0], quantity: 3 }],
          }),
        ];

        await service.decideReturn(RETURN_ID, OPERATOR_ID, {
          decision: ReturnDecision.REFUND,
          reason: 'Чек знайшовся',
        });

        expect(decided).toHaveLength(1);
      });

      it('409 RETURN_QUANTITY_EXCEEDED when a newer request holds the units, writing nothing', async () => {
        returnRepositoryMock.findById.mockResolvedValue(rejected());
        decideLedger = [
          makeReturn({
            id: 'newer-return',
            status: ReturnStatus.REQUESTED,
            items: [{ ...makeReturn().items[0], quantity: 2 }],
          }),
        ];

        const result = await refusal(
          service.decideReturn(RETURN_ID, OPERATOR_ID, {
            decision: ReturnDecision.REFUND,
            reason: 'Чек знайшовся',
          }),
        );

        expect(result).toEqual({
          status: 409,
          body: {
            error: 'RETURN_QUANTITY_EXCEEDED',
            message: 'Cannot return 2 of that item — 1 remain returnable',
          },
        });
        expect(decided).toHaveLength(0);
      });
    });
  });

  // ─── addRepairStep (TASK-2045) ────────────────────────────────────────────────

  describe('addRepairStep (TASK-2045)', () => {
    const OPERATOR_ID = 'operator-uuid-1';

    /** What the mocked repository wrote — only steps that passed every check. */
    let written: Array<{ returnId: string; event: Record<string, unknown> }>;

    beforeEach(() => {
      written = [];
      returnRepositoryMock.addRepairStep.mockImplementation(
        async (returnId: string, event: Record<string, unknown>) => {
          written.push({ returnId, event });
          return makeReturn({ decision: ReturnDecision.REPAIR, status: ReturnStatus.APPROVED });
        },
      );
    });

    /** A return decided as REPAIR, with the steps already recorded on it. */
    const repairing = (
      steps: ReturnRepairStep[] = [],
      overrides: Partial<ReturnWithItems> = {},
    ): ReturnWithItems =>
      makeReturn({
        status: ReturnStatus.APPROVED,
        decision: ReturnDecision.REPAIR,
        decisionReason: null,
        repairEvents: steps.map((step, index) => ({
          id: `repair-${index}`,
          step,
          result: step === ReturnRepairStep.RETURNED_FROM_SERVICE ? RepairResult.REPAIRED : null,
          destination: null,
          ttn: null,
          note: null,
          actor: null,
          createdAt: now,
        })),
        ...overrides,
      });

    const refusal = async (promise: Promise<unknown>) => {
      const caught = (await promise.then(
        () => {
          throw new Error('expected a refusal');
        },
        (error: unknown) => error,
      )) as HttpException;
      expect(caught).toBeInstanceOf(HttpException);
      return {
        status: caught.getStatus(),
        body: caught.getResponse() as { error: string; message: string },
      };
    };

    describe('recording a step', () => {
      it('records ACCEPTED as the first step, with its author and a time', async () => {
        returnRepositoryMock.findById.mockResolvedValue(repairing());

        const result = await service.addRepairStep(RETURN_ID, OPERATOR_ID, {
          step: ReturnRepairStep.ACCEPTED,
          note: 'Коробка без пломби',
        });

        expect(written).toHaveLength(1);
        expect(written[0].returnId).toBe(RETURN_ID);
        expect(written[0].event).toEqual({
          step: ReturnRepairStep.ACCEPTED,
          result: null,
          destination: null,
          ttn: null,
          note: 'Коробка без пломби',
          actorId: OPERATOR_ID,
          createdAt: expect.any(Date),
        });
        expect(result).toBeInstanceOf(ReturnEntity);
      });

      it('answers with the admin card — the operator sees internal fields', async () => {
        returnRepositoryMock.findById.mockResolvedValue(repairing());
        returnRepositoryMock.addRepairStep.mockResolvedValue(
          repairing([ReturnRepairStep.ACCEPTED], { operatorNotes: 'internal' }),
        );

        const result = await service.addRepairStep(RETURN_ID, OPERATOR_ID, {
          step: ReturnRepairStep.ACCEPTED,
        });

        expect(result.operatorNotes).toBe('internal');
      });

      it('records the service and the waybill on the way to the service', async () => {
        returnRepositoryMock.findById.mockResolvedValue(repairing([ReturnRepairStep.ACCEPTED]));

        await service.addRepairStep(RETURN_ID, OPERATOR_ID, {
          step: ReturnRepairStep.SENT_TO_SERVICE,
          destination: 'СЦ Apple, Київ',
          ttn: '20450000000001',
        });

        expect(written[0].event).toMatchObject({
          step: ReturnRepairStep.SENT_TO_SERVICE,
          destination: 'СЦ Apple, Київ',
          ttn: '20450000000001',
          result: null,
        });
      });

      it.each([RepairResult.REPAIRED, RepairResult.UNREPAIRABLE])(
        'records RETURNED_FROM_SERVICE with result %s',
        async (repairResult) => {
          returnRepositoryMock.findById.mockResolvedValue(
            repairing([ReturnRepairStep.ACCEPTED, ReturnRepairStep.SENT_TO_SERVICE]),
          );

          await service.addRepairStep(RETURN_ID, OPERATOR_ID, {
            step: ReturnRepairStep.RETURNED_FROM_SERVICE,
            result: repairResult,
          });

          expect(written[0].event).toMatchObject({
            step: ReturnRepairStep.RETURNED_FROM_SERVICE,
            result: repairResult,
          });
        },
      );

      it('UNREPAIRABLE does not change the decision — the operator does that, with a reason', async () => {
        returnRepositoryMock.findById.mockResolvedValue(
          repairing([ReturnRepairStep.ACCEPTED, ReturnRepairStep.SENT_TO_SERVICE]),
        );

        await service.addRepairStep(RETURN_ID, OPERATOR_ID, {
          step: ReturnRepairStep.RETURNED_FROM_SERVICE,
          result: RepairResult.UNREPAIRABLE,
        });

        expect(returnRepositoryMock.decide).not.toHaveBeenCalled();
        expect(written[0].event).not.toHaveProperty('decision');
      });

      it('records HANDED_TO_CUSTOMER after the item came back', async () => {
        returnRepositoryMock.findById.mockResolvedValue(
          repairing([
            ReturnRepairStep.ACCEPTED,
            ReturnRepairStep.SENT_TO_SERVICE,
            ReturnRepairStep.RETURNED_FROM_SERVICE,
          ]),
        );

        await service.addRepairStep(RETURN_ID, OPERATOR_ID, {
          step: ReturnRepairStep.HANDED_TO_CUSTOMER,
          ttn: '20450000000002',
        });

        expect(written[0].event).toMatchObject({ step: ReturnRepairStep.HANDED_TO_CUSTOMER });
      });
    });

    describe('what is refused', () => {
      it('404 RETURN_NOT_FOUND for an unknown return', async () => {
        returnRepositoryMock.findById.mockResolvedValue(null);

        const result = await refusal(
          service.addRepairStep(RETURN_ID, OPERATOR_ID, { step: ReturnRepairStep.ACCEPTED }),
        );

        expect(result).toEqual({
          status: 404,
          body: { error: 'RETURN_NOT_FOUND', message: 'Return not found' },
        });
        expect(written).toHaveLength(0);
      });

      it.each([ReturnDecision.REFUND, ReturnDecision.REPLACEMENT, ReturnDecision.REJECT, null])(
        '409 RETURN_REPAIR_STEP_INVALID under decision %s, writing nothing',
        async (decision) => {
          returnRepositoryMock.findById.mockResolvedValue(repairing([], { decision }));

          const result = await refusal(
            service.addRepairStep(RETURN_ID, OPERATOR_ID, { step: ReturnRepairStep.ACCEPTED }),
          );

          expect(result).toEqual({
            status: 409,
            body: {
              error: 'RETURN_REPAIR_STEP_INVALID',
              message: 'Repair steps are recorded only on an open return decided as REPAIR',
            },
          });
          expect(written).toHaveLength(0);
        },
      );

      it.each([ReturnStatus.REJECTED, ReturnStatus.REFUNDED])(
        '409 RETURN_REPAIR_STEP_INVALID on a closed return (%s)',
        async (status) => {
          returnRepositoryMock.findById.mockResolvedValue(repairing([], { status }));

          const result = await refusal(
            service.addRepairStep(RETURN_ID, OPERATOR_ID, { step: ReturnRepairStep.ACCEPTED }),
          );

          expect(result.status).toBe(409);
          expect(result.body.error).toBe('RETURN_REPAIR_STEP_INVALID');
          expect(written).toHaveLength(0);
        },
      );

      it('409 RETURN_REPAIR_STEP_INVALID for a skipped step, naming the one expected', async () => {
        returnRepositoryMock.findById.mockResolvedValue(repairing());

        const result = await refusal(
          service.addRepairStep(RETURN_ID, OPERATOR_ID, {
            step: ReturnRepairStep.SENT_TO_SERVICE,
          }),
        );

        expect(result).toEqual({
          status: 409,
          body: {
            error: 'RETURN_REPAIR_STEP_INVALID',
            message: 'The next repair step is ACCEPTED, not SENT_TO_SERVICE',
          },
        });
        expect(written).toHaveLength(0);
      });

      it('409 RETURN_REPAIR_STEP_INVALID for a repeated step', async () => {
        returnRepositoryMock.findById.mockResolvedValue(repairing([ReturnRepairStep.ACCEPTED]));

        const result = await refusal(
          service.addRepairStep(RETURN_ID, OPERATOR_ID, { step: ReturnRepairStep.ACCEPTED }),
        );

        expect(result.status).toBe(409);
        expect(result.body).toEqual({
          error: 'RETURN_REPAIR_STEP_INVALID',
          message: 'The next repair step is SENT_TO_SERVICE, not ACCEPTED',
        });
      });

      it('409 RETURN_REPAIR_STEP_INVALID once the repair is complete', async () => {
        returnRepositoryMock.findById.mockResolvedValue(
          repairing([
            ReturnRepairStep.ACCEPTED,
            ReturnRepairStep.SENT_TO_SERVICE,
            ReturnRepairStep.RETURNED_FROM_SERVICE,
            ReturnRepairStep.HANDED_TO_CUSTOMER,
          ]),
        );

        const result = await refusal(
          service.addRepairStep(RETURN_ID, OPERATOR_ID, {
            step: ReturnRepairStep.HANDED_TO_CUSTOMER,
          }),
        );

        expect(result).toEqual({
          status: 409,
          body: {
            error: 'RETURN_REPAIR_STEP_INVALID',
            message: 'The repair is complete — no step follows HANDED_TO_CUSTOMER',
          },
        });
      });

      it('400 RETURN_REPAIR_RESULT_REQUIRED when the item comes back without an outcome', async () => {
        returnRepositoryMock.findById.mockResolvedValue(
          repairing([ReturnRepairStep.ACCEPTED, ReturnRepairStep.SENT_TO_SERVICE]),
        );

        const result = await refusal(
          service.addRepairStep(RETURN_ID, OPERATOR_ID, {
            step: ReturnRepairStep.RETURNED_FROM_SERVICE,
          }),
        );

        expect(result).toEqual({
          status: 400,
          body: {
            error: 'RETURN_REPAIR_RESULT_REQUIRED',
            message: 'RETURNED_FROM_SERVICE needs a result: REPAIRED or UNREPAIRABLE',
          },
        });
        expect(written).toHaveLength(0);
      });

      it.each([
        ReturnRepairStep.ACCEPTED,
        ReturnRepairStep.SENT_TO_SERVICE,
        ReturnRepairStep.HANDED_TO_CUSTOMER,
      ])('400 RETURN_REPAIR_RESULT_NOT_ALLOWED for a result on %s', async (step) => {
        returnRepositoryMock.findById.mockResolvedValue(repairing());

        const result = await refusal(
          service.addRepairStep(RETURN_ID, OPERATOR_ID, { step, result: RepairResult.REPAIRED }),
        );

        expect(result).toEqual({
          status: 400,
          body: {
            error: 'RETURN_REPAIR_RESULT_NOT_ALLOWED',
            message: `A result is recorded only on RETURNED_FROM_SERVICE, not on ${step}`,
          },
        });
        expect(written).toHaveLength(0);
      });
    });
  });
});
