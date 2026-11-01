import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import {
  DeliveryMethod,
  MoneyDirection,
  MoneyEntryKind,
  MoneyProviderState,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ReturnDecision,
  ReturnStatus,
  UserRole,
} from '@prisma/client';
import { PermissionService, type PermissionActor } from '../auth/permissions';
import { OrderMoneyRepository, type LockedOrder } from './order-money.repository';
import { OrderMoneyService } from './order-money.service';
import { OrderErrorCode } from './order.errors';

/**
 * TASK-2047 / TASK-2046 / TASK-1968 / TASK-951 / TASK-1967 / TASK-2337 (R2 A3) —
 * the operator's money door. The repository is a double; the rules are the real
 * pure ones, so these tests pin which error code each refusal carries and that
 * every write runs under the order lock, checks freshness first and recomputes.
 */
describe('OrderMoneyService', () => {
  const ORDER_ID = 'order-1';
  const UPDATED_AT = new Date('2026-11-01T10:00:00.000Z');
  const admin: PermissionActor = {
    id: 'admin-1',
    email: 'a@shop.ua',
    role: UserRole.ADMIN,
    isOwner: false,
    permissions: new Set(),
  };
  const manager = (...permissions: string[]): PermissionActor => ({
    id: 'manager-1',
    email: 'm@shop.ua',
    role: UserRole.MANAGER,
    isOwner: false,
    permissions: new Set(permissions),
  });

  let locked: LockedOrder;
  let basis: {
    paidKop: number;
    refundedKop: number;
    returns: Array<{
      id: string;
      status: ReturnStatus;
      decision: ReturnDecision | null;
      creditKop: number | null;
      paidOutKop: number;
    }>;
  };
  const tx = { tx: true };

  const repo = {
    transaction: jest.fn(),
    readBasis: jest.fn(),
    insertEntry: jest.fn(),
    reverseEntry: jest.fn(),
    findEntry: jest.fn(),
    voidEntry: jest.fn(),
    recompute: jest.fn(),
    syncReturnStatus: jest.fn(),
    findSnapshot: jest.fn(),
  };
  const providerRefunds = { requestLedgerRefund: jest.fn() };
  const moduleRef = { get: jest.fn() };
  const logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

  let service: OrderMoneyService;

  const snapshot = () => ({
    id: ORDER_ID,
    status: locked.status,
    paymentStatus: PaymentStatus.PAID,
    paymentMethod: locked.paymentMethod,
    deliveryMethod: locked.deliveryMethod,
    totalKop: locked.totalKop,
    paidKop: basis.paidKop,
    refundedKop: basis.refundedKop,
    returnCreditKop: 0,
    balanceKop: 0,
    updatedAt: UPDATED_AT,
    entries: [],
    returns: [],
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    locked = {
      id: ORDER_ID,
      totalKop: 100_000,
      status: OrderStatus.DELIVERED,
      paymentStatus: PaymentStatus.PENDING,
      paymentMethod: PaymentMethod.ON_DELIVERY,
      deliveryMethod: DeliveryMethod.NOVA_POSHTA,
      updatedAt: UPDATED_AT,
    };
    basis = { paidKop: 0, refundedKop: 0, returns: [] };
    repo.transaction.mockImplementation(
      (_id: string, body: (t: unknown, o: LockedOrder) => unknown) => body(tx, locked),
    );
    repo.readBasis.mockImplementation(async () => basis);
    repo.insertEntry.mockImplementation(async (_t, entry: { kind: MoneyEntryKind }) => ({
      id: 'entry-new',
      ...entry,
    }));
    repo.recompute.mockResolvedValue({});
    repo.findSnapshot.mockImplementation(async () => snapshot());
    moduleRef.get.mockReturnValue(providerRefunds);

    const module = await Test.createTestingModule({
      providers: [
        OrderMoneyService,
        { provide: OrderMoneyRepository, useValue: repo },
        { provide: PermissionService, useValue: new PermissionService({} as never) },
        { provide: ModuleRef, useValue: moduleRef },
        { provide: PinoLogger, useValue: logger },
      ],
    }).compile();
    service = module.get(OrderMoneyService);
  });

  const codeOf = async (promise: Promise<unknown>): Promise<string | undefined> => {
    try {
      await promise;
    } catch (err) {
      const response = (err as { getResponse?: () => unknown }).getResponse?.();
      return (response as { error?: string } | undefined)?.error;
    }
    return undefined;
  };

  describe('recordReceipt', () => {
    const receipt = {
      kind: MoneyEntryKind.COD_NOVA_POSHTA,
      amountKop: 100_000,
      expectedUpdatedAt: UPDATED_AT,
    };

    it('writes the IN entry under the lock and recomputes', async () => {
      await service.recordReceipt(ORDER_ID, admin, receipt);

      expect(repo.transaction).toHaveBeenCalledWith(ORDER_ID, expect.any(Function));
      expect(repo.insertEntry).toHaveBeenCalledWith(tx, {
        orderId: ORDER_ID,
        kind: MoneyEntryKind.COD_NOVA_POSHTA,
        amountKop: 100_000,
        actorId: admin.id,
        reason: null,
        occurredAt: undefined,
      });
      expect(repo.recompute).toHaveBeenCalledWith(tx, ORDER_ID, admin.id);
    });

    it('accepts a part payment and keeps the note and the date', async () => {
      const occurredAt = new Date('2026-10-30T09:00:00.000Z');
      await service.recordReceipt(ORDER_ID, admin, {
        ...receipt,
        kind: MoneyEntryKind.BANK_TRANSFER,
        amountKop: 30_000,
        note: 'передоплата',
        occurredAt,
      });
      expect(repo.insertEntry).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ amountKop: 30_000, reason: 'передоплата', occurredAt }),
      );
    });

    it('refuses a stale screen (409 ORDER_STALE) before writing anything', async () => {
      const code = await codeOf(
        service.recordReceipt(ORDER_ID, admin, {
          ...receipt,
          expectedUpdatedAt: new Date('2026-11-01T09:59:59.000Z'),
        }),
      );
      expect(code).toBe(OrderErrorCode.STALE);
      expect(repo.insertEntry).not.toHaveBeenCalled();
    });

    it('refuses a kind the delivery does not admit (no «Гроші від НП» on a pickup)', async () => {
      locked.deliveryMethod = DeliveryMethod.PICKUP;
      expect(await codeOf(service.recordReceipt(ORDER_ID, admin, receipt))).toBe(
        OrderErrorCode.MONEY_IN_KIND_NOT_ALLOWED,
      );
      expect(repo.insertEntry).not.toHaveBeenCalled();
    });

    it('refuses LIQPAY_PAYMENT by hand', async () => {
      expect(
        await codeOf(
          service.recordReceipt(ORDER_ID, admin, {
            ...receipt,
            kind: MoneyEntryKind.LIQPAY_PAYMENT,
          }),
        ),
      ).toBe(OrderErrorCode.MONEY_IN_KIND_NOT_ALLOWED);
    });

    it('refuses an overpayment without a reason', async () => {
      basis.paidKop = 100_000;
      expect(await codeOf(service.recordReceipt(ORDER_ID, admin, receipt))).toBe(
        OrderErrorCode.MONEY_OVERPAYMENT_REASON_REQUIRED,
      );
    });

    it('refuses a receipt dated in the future', async () => {
      expect(
        await codeOf(
          service.recordReceipt(ORDER_ID, admin, {
            ...receipt,
            occurredAt: new Date(Date.now() + 24 * 3600 * 1000),
          }),
        ),
      ).toBe(OrderErrorCode.MONEY_ENTRY_INVALID);
    });

    it('answers with the fresh money view', async () => {
      const view = await service.recordReceipt(ORDER_ID, admin, receipt);
      expect(view.orderId).toBe(ORDER_ID);
      expect(view.updatedAt).toEqual(UPDATED_AT);
    });
  });

  describe('recordPayout', () => {
    const paidDelivered = () => {
      basis.paidKop = 100_000;
    };

    it('pays a cancelled order back in cash without a return', async () => {
      paidDelivered();
      locked.status = OrderStatus.CANCELLED;
      await service.recordPayout(ORDER_ID, admin, {
        kind: MoneyEntryKind.CASH_REFUND,
        amountKop: 60_000,
        expectedUpdatedAt: UPDATED_AT,
      });
      expect(repo.insertEntry).toHaveBeenCalledWith(tx, {
        orderId: ORDER_ID,
        kind: MoneyEntryKind.CASH_REFUND,
        amountKop: 60_000,
        returnId: null,
        actorId: admin.id,
        reason: null,
      });
      expect(repo.recompute).toHaveBeenCalledWith(tx, ORDER_ID, admin.id);
      expect(repo.syncReturnStatus).not.toHaveBeenCalled();
    });

    it.each([
      [OrderStatus.CONFIRMED, OrderErrorCode.MONEY_ORDER_LIVE],
      [OrderStatus.DELIVERED, OrderErrorCode.MONEY_RETURN_REQUIRED],
    ])('refuses a payout without a return on a %s order (%s)', async (status, expected) => {
      paidDelivered();
      locked.status = status;
      expect(
        await codeOf(
          service.recordPayout(ORDER_ID, admin, {
            kind: MoneyEntryKind.CASH_REFUND,
            amountKop: 1,
            expectedUpdatedAt: UPDATED_AT,
          }),
        ),
      ).toBe(expected);
      expect(repo.insertEntry).not.toHaveBeenCalled();
    });

    it('refuses a payout on an unpaid order', async () => {
      locked.status = OrderStatus.CANCELLED;
      expect(
        await codeOf(
          service.recordPayout(ORDER_ID, admin, {
            kind: MoneyEntryKind.TRANSFER_REFUND,
            amountKop: 1,
            expectedUpdatedAt: UPDATED_AT,
          }),
        ),
      ).toBe(OrderErrorCode.MONEY_NOTHING_PAID);
    });

    describe('for a return', () => {
      beforeEach(() => {
        paidDelivered();
        basis.returns = [
          {
            id: 'ret-1',
            status: ReturnStatus.RECEIVED,
            decision: ReturnDecision.REFUND,
            creditKop: 40_000,
            paidOutKop: 10_000,
          },
        ];
      });

      it('pays up to what is still owed on it, then derives its status', async () => {
        await service.recordPayout(ORDER_ID, admin, {
          kind: MoneyEntryKind.CASH_REFUND,
          amountKop: 30_000,
          returnId: 'ret-1',
          reason: 'друга частина',
          expectedUpdatedAt: UPDATED_AT,
        });
        expect(repo.insertEntry).toHaveBeenCalledWith(
          tx,
          expect.objectContaining({
            returnId: 'ret-1',
            amountKop: 30_000,
            reason: 'друга частина',
          }),
        );
        expect(repo.syncReturnStatus).toHaveBeenCalledWith(tx, 'ret-1');
      });

      it('refuses more than is owed on the return (409, ceiling code)', async () => {
        expect(
          await codeOf(
            service.recordPayout(ORDER_ID, admin, {
              kind: MoneyEntryKind.CASH_REFUND,
              amountKop: 30_001,
              returnId: 'ret-1',
              expectedUpdatedAt: UPDATED_AT,
            }),
          ),
        ).toBe(OrderErrorCode.MONEY_REFUND_EXCEEDS_PAID);
      });

      it('refuses a return of another order (404)', async () => {
        await expect(
          service.recordPayout(ORDER_ID, admin, {
            kind: MoneyEntryKind.CASH_REFUND,
            amountKop: 1,
            returnId: 'ret-of-someone-else',
            expectedUpdatedAt: UPDATED_AT,
          }),
        ).rejects.toThrow(NotFoundException);
      });

      it('refuses a return not decided REFUND, and one whose goods are not back', async () => {
        basis.returns[0].decision = ReturnDecision.REPLACEMENT;
        expect(
          await codeOf(
            service.recordPayout(ORDER_ID, admin, {
              kind: MoneyEntryKind.CASH_REFUND,
              amountKop: 1,
              returnId: 'ret-1',
              expectedUpdatedAt: UPDATED_AT,
            }),
          ),
        ).toBe(OrderErrorCode.MONEY_RETURN_NOT_REFUND);

        basis.returns[0].decision = ReturnDecision.REFUND;
        basis.returns[0].status = ReturnStatus.APPROVED;
        expect(
          await codeOf(
            service.recordPayout(ORDER_ID, admin, {
              kind: MoneyEntryKind.CASH_REFUND,
              amountKop: 1,
              returnId: 'ret-1',
              expectedUpdatedAt: UPDATED_AT,
            }),
          ),
        ).toBe(OrderErrorCode.MONEY_RETURN_NOT_RECEIVED);
      });

      it('needs returns:write as well as payments:refund for a return payout (403)', async () => {
        await expect(
          service.recordPayout(ORDER_ID, manager('payments:refund'), {
            kind: MoneyEntryKind.CASH_REFUND,
            amountKop: 1,
            returnId: 'ret-1',
            expectedUpdatedAt: UPDATED_AT,
          }),
        ).rejects.toThrow(ForbiddenException);
        expect(repo.transaction).not.toHaveBeenCalled();
      });
    });

    describe('LIQPAY_REFUND', () => {
      it('needs the payment it refunds', async () => {
        expect(
          await codeOf(
            service.recordPayout(ORDER_ID, admin, {
              kind: MoneyEntryKind.LIQPAY_REFUND,
              amountKop: 1,
              expectedUpdatedAt: UPDATED_AT,
            }),
          ),
        ).toBe(OrderErrorCode.MONEY_ENTRY_INVALID);
      });

      it('refuses a paymentId on a cash or transfer payout', async () => {
        expect(
          await codeOf(
            service.recordPayout(ORDER_ID, admin, {
              kind: MoneyEntryKind.CASH_REFUND,
              amountKop: 1,
              paymentId: 'pay-1',
              expectedUpdatedAt: UPDATED_AT,
            }),
          ),
        ).toBe(OrderErrorCode.MONEY_ENTRY_INVALID);
      });

      it('delegates to the provider path with a guard that applies the same rules under the lock', async () => {
        await service.recordPayout(ORDER_ID, admin, {
          kind: MoneyEntryKind.LIQPAY_REFUND,
          amountKop: 5_000,
          paymentId: 'pay-1',
          returnId: undefined,
          expectedUpdatedAt: UPDATED_AT,
        });
        expect(repo.insertEntry).not.toHaveBeenCalled();
        expect(providerRefunds.requestLedgerRefund).toHaveBeenCalledWith(
          expect.objectContaining({
            orderId: ORDER_ID,
            paymentId: 'pay-1',
            amountKop: 5_000,
            actorId: admin.id,
            returnId: null,
            reason: null,
            guard: expect.any(Function),
          }),
        );

        // The guard is the payout rule: a live order is refused.
        const { guard } = providerRefunds.requestLedgerRefund.mock.calls[0][0] as {
          guard: (t: unknown, o: LockedOrder) => Promise<void>;
        };
        basis.paidKop = 100_000;
        locked.status = OrderStatus.CONFIRMED;
        expect(await codeOf(guard(tx, locked))).toBe(OrderErrorCode.MONEY_ORDER_LIVE);
        locked.status = OrderStatus.CANCELLED;
        await expect(guard(tx, locked)).resolves.toBeUndefined();
        expect(await codeOf(guard(tx, { ...locked, updatedAt: new Date(0) }))).toBe(
          OrderErrorCode.STALE,
        );
      });
    });
  });

  describe('reverseEntry', () => {
    it('reverses with the reason, recomputes, and re-derives the return', async () => {
      repo.reverseEntry.mockResolvedValue({ id: 'rev-1', returnId: 'ret-1', direction: 'OUT' });
      await service.reverseEntry(ORDER_ID, 'entry-1', admin, {
        reason: 'помилка каси',
        expectedUpdatedAt: UPDATED_AT,
      });
      expect(repo.reverseEntry).toHaveBeenCalledWith(tx, {
        orderId: ORDER_ID,
        entryId: 'entry-1',
        actorId: admin.id,
        reason: 'помилка каси',
      });
      // TASK-1969: an OUT reversal may move a REFUNDED order back.
      expect(repo.recompute).toHaveBeenCalledWith(tx, ORDER_ID, admin.id, { payoutUndone: true });
      expect(repo.syncReturnStatus).toHaveBeenCalledWith(tx, 'ret-1');
    });

    it('does not touch returns for an entry without one', async () => {
      repo.reverseEntry.mockResolvedValue({ id: 'rev-1', returnId: null });
      await service.reverseEntry(ORDER_ID, 'entry-1', admin, {
        reason: 'x',
        expectedUpdatedAt: UPDATED_AT,
      });
      expect(repo.syncReturnStatus).not.toHaveBeenCalled();
    });

    it('is refused on a stale screen', async () => {
      expect(
        await codeOf(
          service.reverseEntry(ORDER_ID, 'entry-1', admin, {
            reason: 'x',
            expectedUpdatedAt: new Date(0),
          }),
        ),
      ).toBe(OrderErrorCode.STALE);
      expect(repo.reverseEntry).not.toHaveBeenCalled();
    });
  });

  describe('voidEntry (TASK-2337)', () => {
    const requested = {
      id: 'entry-1',
      orderId: ORDER_ID,
      direction: MoneyDirection.OUT,
      kind: MoneyEntryKind.LIQPAY_REFUND,
      providerState: MoneyProviderState.REQUESTED,
      voidedAt: null,
      returnId: 'ret-1',
    };

    it('voids a stuck REQUESTED LiqPay refund with the reason and recomputes', async () => {
      repo.findEntry.mockResolvedValue(requested);
      repo.voidEntry.mockResolvedValue(true);
      await service.voidEntry(ORDER_ID, 'entry-1', admin, {
        reason: 'LiqPay відхилив',
        expectedUpdatedAt: UPDATED_AT,
      });
      expect(repo.voidEntry).toHaveBeenCalledWith(tx, 'entry-1', 'LiqPay відхилив');
      expect(repo.recompute).toHaveBeenCalledWith(tx, ORDER_ID, admin.id, { payoutUndone: true });
      expect(repo.syncReturnStatus).toHaveBeenCalledWith(tx, 'ret-1');
    });

    it.each([
      { ...requested, kind: MoneyEntryKind.CASH_REFUND, providerState: null },
      { ...requested, providerState: MoneyProviderState.CONFIRMED },
      { ...requested, voidedAt: new Date() },
    ])('refuses anything but a live REQUESTED LiqPay refund (409)', async (entry) => {
      repo.findEntry.mockResolvedValue(entry);
      expect(
        await codeOf(
          service.voidEntry(ORDER_ID, 'entry-1', admin, {
            reason: 'x',
            expectedUpdatedAt: UPDATED_AT,
          }),
        ),
      ).toBe(OrderErrorCode.MONEY_VOID_REFUSED);
      expect(repo.voidEntry).not.toHaveBeenCalled();
    });

    it('404s an entry of another order', async () => {
      repo.findEntry.mockResolvedValue(null);
      await expect(
        service.voidEntry(ORDER_ID, 'nope', admin, { reason: 'x', expectedUpdatedAt: UPDATED_AT }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getMoney', () => {
    it('404s an unknown order', async () => {
      repo.findSnapshot.mockResolvedValue(null);
      await expect(service.getMoney('nope', admin)).rejects.toThrow(NotFoundException);
    });

    it('derives allowed IN kinds, payout ceilings and per-return money from the snapshot', async () => {
      const at = new Date('2026-10-30T10:00:00.000Z');
      repo.findSnapshot.mockResolvedValue({
        ...snapshot(),
        status: OrderStatus.DELIVERED,
        paymentMethod: PaymentMethod.ONLINE,
        deliveryMethod: DeliveryMethod.PICKUP,
        totalKop: 100_000,
        paidKop: 150_000,
        refundedKop: 10_000,
        returnCreditKop: 40_000,
        balanceKop: -80_000,
        entries: [
          {
            id: 'in-1',
            direction: MoneyDirection.IN,
            kind: MoneyEntryKind.LIQPAY_PAYMENT,
            amountKop: 100_000,
            paymentId: 'pay-1',
            returnId: null,
            providerRef: 'success',
            providerState: null,
            actorId: null,
            actorName: null,
            reason: null,
            reversalOfId: null,
            reversedById: null,
            voidedAt: null,
            voidReason: null,
            legacy: false,
            occurredAt: at,
            createdAt: at,
          },
          {
            id: 'in-2',
            direction: MoneyDirection.IN,
            kind: MoneyEntryKind.PAID_AT_POINT,
            amountKop: 50_000,
            paymentId: null,
            returnId: null,
            providerRef: null,
            providerState: null,
            actorId: 'admin-1',
            actorName: 'Олена Коваль',
            reason: 'повторна оплата',
            reversalOfId: null,
            reversedById: null,
            voidedAt: null,
            voidReason: null,
            legacy: false,
            occurredAt: at,
            createdAt: at,
          },
          {
            id: 'out-1',
            direction: MoneyDirection.OUT,
            kind: MoneyEntryKind.CASH_REFUND,
            amountKop: 10_000,
            paymentId: null,
            returnId: 'ret-1',
            providerRef: null,
            providerState: null,
            actorId: 'admin-1',
            actorName: 'Олена Коваль',
            reason: null,
            reversalOfId: null,
            reversedById: null,
            voidedAt: null,
            voidReason: null,
            legacy: false,
            occurredAt: at,
            createdAt: at,
          },
        ],
        returns: [
          {
            id: 'ret-1',
            status: ReturnStatus.RECEIVED,
            decision: ReturnDecision.REFUND,
            creditKop: 40_000,
            creditReason: null,
          },
        ],
      });

      const view = await service.getMoney(ORDER_ID, admin);

      expect(view.totals).toEqual({
        totalKop: 100_000,
        paidKop: 150_000,
        refundedKop: 10_000,
        returnCreditKop: 40_000,
        balanceKop: -80_000,
      });
      expect(view.allowedInKinds).toEqual([
        MoneyEntryKind.PAID_AT_POINT,
        MoneyEntryKind.BANK_TRANSFER,
      ]);
      expect(view.returns).toEqual([
        {
          returnId: 'ret-1',
          status: ReturnStatus.RECEIVED,
          creditKop: 40_000,
          creditReason: null,
          paidOutKop: 10_000,
          owedKop: 30_000,
        },
      ]);
      // −balance 80 000 less the 30 000 the return still owes.
      expect(view.outWithoutReturnMaxKop).toBe(50_000);
      expect(view.refundablePayments).toEqual([{ paymentId: 'pay-1', remainingKop: 100_000 }]);
      expect(view.entries.map((e) => e.id)).toEqual(['in-1', 'in-2', 'out-1']);
      expect(view.entries[1].actorName).toBe('Олена Коваль');
    });

    it('hides the refundable payments from a reader without payments:read', async () => {
      const view = await service.getMoney(ORDER_ID, manager('orders:read'));
      expect(view.refundablePayments).toBeNull();
      const withPayments = await service.getMoney(
        ORDER_ID,
        manager('orders:read', 'payments:read'),
      );
      expect(withPayments.refundablePayments).toEqual([]);
    });
  });

  it('every refusal is a domain error with a stable code, not a bare 409', async () => {
    locked.status = OrderStatus.CONFIRMED;
    basis.paidKop = 100_000;
    await expect(
      service.recordPayout(ORDER_ID, admin, {
        kind: MoneyEntryKind.CASH_REFUND,
        amountKop: 1,
        expectedUpdatedAt: UPDATED_AT,
      }),
    ).rejects.toThrow(ConflictException);
  });
});
