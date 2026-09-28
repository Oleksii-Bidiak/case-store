import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { OrderStatus, ReturnStatus } from '@prisma/client';
import { MY_RETURNS_LIMIT, ReturnService } from './return.service';
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
    createdByUserId: USER_ID,
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
      async (params: unknown, assertClaimable?: (rows: ReturnWithItems[]) => void) => {
        assertClaimable?.(ledger);
        inserted.push(params);
        return makeReturn();
      },
    );

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
        expect.any(Function),
      );
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
      );
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

    it('records the OPERATOR as the author, not the customer whose order it is', async () => {
      orderRepositoryMock.findById.mockResolvedValue(makeOrder());

      await service.adminCreateReturn(OPERATOR_ID, ORDER_ID, dto);

      expect(returnRepositoryMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ createdByUserId: OPERATOR_ID }),
        expect.any(Function),
      );
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
      expect(returnRepositoryMock.findByOrderId).toHaveBeenCalledWith(ORDER_ID);
      // No ownership read: there is nobody to compare against.
      expect(orderRepositoryMock.findById).not.toHaveBeenCalled();
    });

    it('is empty when nothing has been opened — the signal the REFUNDED dialog reads', async () => {
      returnRepositoryMock.findByOrderId.mockResolvedValue([]);

      await expect(service.adminGetOrderReturns(ORDER_ID)).resolves.toEqual([]);
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
          makeReturn({ status: ReturnStatus.RECEIVED }),
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
          RETURN_ID,
          expect.objectContaining({ refundedAmount: '499.00' }),
          { restock: false, assertRefundable: expect.any(Function) },
        );
      });

      it('asks nothing when no amount is being recorded', async () => {
        await service.resolveReturn(RETURN_ID, { status: ReturnStatus.REFUNDED });

        expect(returnRepositoryMock.resolve).toHaveBeenCalledWith(RETURN_ID, expect.anything(), {
          restock: false,
        });
      });

      it('lets an operator clear a mistyped amount — null is never over any ceiling', async () => {
        await refund(null);

        expect(returnRepositoryMock.resolve).toHaveBeenCalledWith(
          RETURN_ID,
          expect.objectContaining({ refundedAmount: null }),
          { restock: false },
        );
      });
    });
  });
});
