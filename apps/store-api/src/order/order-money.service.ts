import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PinoLogger } from 'nestjs-pino';
import {
  DeliveryMethod,
  MoneyDirection,
  MoneyEntryKind,
  MoneyProviderState,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  ReturnStatus,
} from '@prisma/client';
import { PermissionService, type PermissionActor } from '../auth/permissions';
import {
  allowedInKinds,
  assessPayout,
  assessReceipt,
  deriveBalance,
  ledgerTotals,
  outWithoutReturnMaxKop,
  outstandingReturnCreditKop,
  providerRefundAvailableKop,
  type PayoutBasis,
} from './order-money';
import {
  OrderMoneyRepository,
  type LockedOrder,
  type MoneyBasis,
  type MoneyEntryRow,
  type OrderMoneySnapshot,
} from './order-money.repository';
import {
  moneyEntryInvalidError,
  moneyPayoutRefusedError,
  moneyReceiptRefusedError,
  moneyVoidRefusedError,
  staleOrderError,
} from './order.errors';
import { PROVIDER_REFUND_PORT, type ProviderRefundPort } from './provider-refund.port';
import { returnNotFoundError } from './returns/return.errors';

type Tx = Prisma.TransactionClient;

/** A receipt the operator records (`POST …/money/in`). */
export interface RecordReceiptInput {
  kind: MoneyEntryKind;
  amountKop: number;
  /** When the money actually arrived; defaults to now, never in the future. */
  occurredAt?: Date;
  note?: string | null;
  expectedUpdatedAt: Date;
}

/** A payout the operator records (`POST …/money/out`). */
export interface RecordPayoutInput {
  kind: MoneyEntryKind;
  amountKop: number;
  returnId?: string | null;
  /** The LiqPay attempt — required for LIQPAY_REFUND, refused otherwise. */
  paymentId?: string | null;
  reason?: string | null;
  expectedUpdatedAt: Date;
}

/** A correction with a mandatory reason (reversal, void). */
export interface MoneyCorrectionInput {
  reason: string;
  expectedUpdatedAt: Date;
}

export interface OrderMoneyTotals {
  totalKop: number;
  paidKop: number;
  refundedKop: number;
  returnCreditKop: number;
  balanceKop: number;
}

export interface ReturnMoneyView {
  returnId: string;
  status: ReturnStatus;
  creditKop: number;
  creditReason: string | null;
  paidOutKop: number;
  owedKop: number;
}

/** The operator's money block, as `GET /admin/orders/:orderId/money` answers it. */
export interface OrderMoneyView {
  orderId: string;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  deliveryMethod: DeliveryMethod;
  /** Send it back as `expectedUpdatedAt` on the next money write. */
  updatedAt: Date;
  totals: OrderMoneyTotals;
  entries: MoneyEntryRow[];
  allowedInKinds: MoneyEntryKind[];
  /** Null for a reader without `payments:read`. */
  refundablePayments: Array<{ paymentId: string; remainingKop: number }> | null;
  outWithoutReturnMaxKop: number;
  returns: ReturnMoneyView[];
}

/** Receipts may be dated a little ahead of the server clock (a phone's clock), not more. */
const OCCURRED_AT_SKEW_MS = 5 * 60 * 1000;

/**
 * OrderMoneyService — the operator's one door onto an order's money (R2 step A3:
 * TASK-2047, TASK-2046, TASK-1968, TASK-951, TASK-1967, TASK-2337).
 *
 * Receipts, payouts, reversals and voids are ledger entries; the payment status,
 * the balance and a return's REFUNDED are derived from them. Every write:
 *
 * 1. runs in ONE transaction whose first statement locks the order row
 *    (`OrderMoneyRepository.transaction`) — the same lock the webhook takes, so
 *    two writers never deadlock and a ceiling read under it cannot be raced;
 * 2. checks the operator's `expectedUpdatedAt` against the LOCKED row (409
 *    ORDER_STALE) — the arbiter, not a pre-read;
 * 3. applies the pure rules of `order-money.ts`, which raise stable codes;
 * 4. writes the entry, `recompute`s the order and re-derives the return;
 * 5. answers with the fresh money view.
 *
 * The action log row comes from `AuditInterceptor` (the request body carries the
 * amount and the reason).
 */
@Injectable()
export class OrderMoneyService {
  constructor(
    private readonly money: OrderMoneyRepository,
    private readonly permissions: PermissionService,
    private readonly moduleRef: ModuleRef,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(OrderMoneyService.name);
  }

  /** The operator's money block. `refundablePayments` only with `payments:read`. */
  async getMoney(orderId: string, actor: PermissionActor): Promise<OrderMoneyView> {
    const snapshot = await this.money.findSnapshot(orderId);
    if (!snapshot) {
      throw new NotFoundException('Order not found');
    }
    return buildMoneyView(snapshot, {
      canSeePayments: this.permissions.actorHasPermission(actor, 'payments:read'),
    });
  }

  /**
   * Record money received (`orders:write`): the delivery's hand-over kind or a
   * bank transfer, in part (prepayment) or in full; more than owed only with a
   * reason.
   *
   * @throws BadRequestException ORDER_MONEY_IN_KIND_NOT_ALLOWED,
   *   ORDER_MONEY_OVERPAYMENT_REASON_REQUIRED, ORDER_MONEY_ENTRY_INVALID
   * @throws ConflictException ORDER_STALE
   */
  async recordReceipt(
    orderId: string,
    actor: PermissionActor,
    input: RecordReceiptInput,
  ): Promise<OrderMoneyView> {
    if (input.occurredAt && input.occurredAt.getTime() > Date.now() + OCCURRED_AT_SKEW_MS) {
      throw moneyEntryInvalidError('A receipt cannot be dated in the future');
    }
    const reason = blankToNull(input.note);

    await this.money.transaction(orderId, async (tx, order) => {
      assertFresh(order, input.expectedUpdatedAt);
      const basis = await this.money.readBasis(tx, orderId);
      const verdict = assessReceipt({
        kind: input.kind,
        amountKop: input.amountKop,
        reason,
        paymentMethod: order.paymentMethod,
        deliveryMethod: order.deliveryMethod,
        balanceKop: balanceOf(order, basis),
      });
      if (!verdict.ok) {
        throw moneyReceiptRefusedError(verdict.refusal);
      }
      await this.money.insertEntry(tx, {
        orderId,
        kind: input.kind,
        amountKop: input.amountKop,
        actorId: actor.id,
        reason,
        occurredAt: input.occurredAt,
      });
      await this.money.recompute(tx, orderId, actor.id);
    });

    this.logger.info(
      {
        event: 'order.money.received',
        orderId,
        actorId: actor.id,
        kind: input.kind,
        amountKop: input.amountKop,
      },
      'Operator recorded a receipt',
    );
    return this.getMoney(orderId, actor);
  }

  /**
   * Record money paid back (`payments:refund`, plus `returns:write` for a
   * return's payout). Cash and transfer are written here; a LIQPAY_REFUND goes
   * through the provider path (REQUESTED → LiqPay → void on refusal) with the
   * same rules run under the same lock.
   *
   * @throws ForbiddenException a return payout without `returns:write`
   * @throws BadRequestException ORDER_MONEY_ENTRY_INVALID (paymentId missing on
   *   a LiqPay refund, or given on another kind)
   * @throws NotFoundException the return is not one of this order's
   * @throws ConflictException ORDER_STALE, ORDER_MONEY_NOTHING_PAID,
   *   ORDER_MONEY_ORDER_LIVE, ORDER_MONEY_RETURN_REQUIRED,
   *   ORDER_MONEY_RETURN_NOT_REFUND, ORDER_MONEY_RETURN_NOT_RECEIVED,
   *   ORDER_MONEY_REFUND_EXCEEDS_PAID
   */
  async recordPayout(
    orderId: string,
    actor: PermissionActor,
    input: RecordPayoutInput,
  ): Promise<OrderMoneyView> {
    const returnId = input.returnId ?? null;
    // AD-RET-16/23: a payout for a return crosses two domains — both keys.
    if (returnId !== null && !this.permissions.actorHasPermission(actor, 'returns:write')) {
      throw new ForbiddenException('Admin access required');
    }
    const reason = blankToNull(input.reason);
    const guard = (tx: Tx, order: LockedOrder) => this.assertPayable(tx, order, input);

    if (input.kind === MoneyEntryKind.LIQPAY_REFUND) {
      if (!input.paymentId) {
        throw moneyEntryInvalidError('A LiqPay refund names the payment it refunds (paymentId)');
      }
      await this.providerRefunds().requestLedgerRefund({
        orderId,
        paymentId: input.paymentId,
        amountKop: input.amountKop,
        actorId: actor.id,
        returnId,
        reason,
        guard,
      });
    } else {
      if (input.paymentId) {
        throw moneyEntryInvalidError('paymentId belongs to a LiqPay refund only');
      }
      await this.money.transaction(orderId, async (tx, order) => {
        await guard(tx, order);
        await this.money.insertEntry(tx, {
          orderId,
          kind: input.kind,
          amountKop: input.amountKop,
          returnId,
          actorId: actor.id,
          reason,
        });
        await this.money.recompute(tx, orderId, actor.id);
        if (returnId !== null) {
          await this.money.syncReturnStatus(tx, returnId);
        }
      });
    }

    this.logger.info(
      {
        event: 'order.money.paid_out',
        orderId,
        actorId: actor.id,
        kind: input.kind,
        amountKop: input.amountKop,
        returnId,
      },
      'Operator recorded a payout',
    );
    return this.getMoney(orderId, actor);
  }

  /**
   * Reverse (сторнувати) an entry with a reason (`payments:correct`). Refused
   * for LiqPay rows, reversals, voided rows, a second reversal, and a receipt
   * the payouts already depend on (A1 `reverseEntry`). A payout's return is
   * re-derived — a reversal that breaks its cover sends it back to RECEIVED.
   */
  async reverseEntry(
    orderId: string,
    entryId: string,
    actor: PermissionActor,
    input: MoneyCorrectionInput,
  ): Promise<OrderMoneyView> {
    await this.money.transaction(orderId, async (tx, order) => {
      assertFresh(order, input.expectedUpdatedAt);
      const reversal = await this.money.reverseEntry(tx, {
        orderId,
        entryId,
        actorId: actor.id,
        reason: input.reason,
      });
      await this.money.recompute(tx, orderId, actor.id);
      if (reversal.returnId) {
        await this.money.syncReturnStatus(tx, reversal.returnId);
      }
    });

    this.logger.info(
      { event: 'order.money.reversed', orderId, entryId, actorId: actor.id },
      'Operator reversed a money entry',
    );
    return this.getMoney(orderId, actor);
  }

  /**
   * Void a LiqPay refund stuck in REQUESTED (`payments:correct`, TASK-2337): the
   * provider refused it but the automatic void failed, so it still counts
   * against the ceiling. Only a live REQUESTED `LIQPAY_REFUND` qualifies.
   */
  async voidEntry(
    orderId: string,
    entryId: string,
    actor: PermissionActor,
    input: MoneyCorrectionInput,
  ): Promise<OrderMoneyView> {
    await this.money.transaction(orderId, async (tx, order) => {
      assertFresh(order, input.expectedUpdatedAt);
      const entry = await this.money.findEntry(tx, orderId, entryId);
      if (!entry) {
        throw new NotFoundException(`Money entry ${entryId} not found on this order`);
      }
      if (
        entry.kind !== MoneyEntryKind.LIQPAY_REFUND ||
        entry.providerState !== MoneyProviderState.REQUESTED ||
        entry.voidedAt !== null
      ) {
        throw moneyVoidRefusedError();
      }
      if (!(await this.money.voidEntry(tx, entryId, input.reason))) {
        throw moneyVoidRefusedError();
      }
      await this.money.recompute(tx, orderId, actor.id);
      if (entry.returnId) {
        await this.money.syncReturnStatus(tx, entry.returnId);
      }
    });

    this.logger.warn(
      { event: 'order.money.voided', orderId, entryId, actorId: actor.id },
      'Operator voided a stuck LiqPay refund request',
    );
    return this.getMoney(orderId, actor);
  }

  /** The payout rules, under the order lock: freshness first, then `assessPayout`. */
  private async assertPayable(tx: Tx, order: LockedOrder, input: RecordPayoutInput): Promise<void> {
    assertFresh(order, input.expectedUpdatedAt);
    const basis = await this.money.readBasis(tx, order.id);
    let ret: MoneyBasis['returns'][number] | undefined;
    if (input.returnId) {
      ret = basis.returns.find((row) => row.id === input.returnId);
      if (!ret) {
        throw returnNotFoundError();
      }
    }
    const verdict = assessPayout(payoutBasisOf(order, basis), input.amountKop, ret);
    if (!verdict.ok) {
      throw moneyPayoutRefusedError(verdict.refusal, input.amountKop, verdict.availableKop);
    }
  }

  private providerRefunds(): ProviderRefundPort {
    try {
      return this.moduleRef.get<ProviderRefundPort>(PROVIDER_REFUND_PORT, { strict: false });
    } catch {
      throw new ServiceUnavailableException('Online refunds are not available');
    }
  }
}

/** ORDER_STALE when the operator's screen predates the locked row. */
function assertFresh(order: LockedOrder, expectedUpdatedAt: Date): void {
  if (order.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
    throw staleOrderError();
  }
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

function returnCreditSum(basis: MoneyBasis): number {
  return basis.returns.reduce((sum, ret) => sum + (ret.creditKop ?? 0), 0);
}

function balanceOf(order: LockedOrder, basis: MoneyBasis): number {
  return deriveBalance({
    totalKop: order.totalKop,
    returnCreditKop: returnCreditSum(basis),
    paidKop: basis.paidKop,
    refundedKop: basis.refundedKop,
    orderStatus: order.status,
  });
}

function payoutBasisOf(order: LockedOrder, basis: MoneyBasis): PayoutBasis {
  return {
    orderStatus: order.status,
    paidKop: basis.paidKop,
    refundedKop: basis.refundedKop,
    balanceKop: balanceOf(order, basis),
    outstandingReturnCreditKop: outstandingReturnCreditKop(basis.returns),
  };
}

/** The view, derived from one snapshot with the same pure rules the writes use. */
function buildMoneyView(
  snapshot: OrderMoneySnapshot,
  options: { canSeePayments: boolean },
): OrderMoneyView {
  const outEntries = snapshot.entries.filter((entry) => entry.direction === MoneyDirection.OUT);
  const returns: ReturnMoneyView[] = snapshot.returns.map((ret) => {
    const creditKop = ret.creditKop ?? 0;
    const paidOutKop = ledgerTotals(outEntries.filter((e) => e.returnId === ret.id)).refundedKop;
    return {
      returnId: ret.id,
      status: ret.status,
      creditKop,
      creditReason: ret.creditReason,
      paidOutKop,
      owedKop: Math.max(0, creditKop - paidOutKop),
    };
  });

  const heldKop = snapshot.paidKop - snapshot.refundedKop;
  const paymentIds = [
    ...new Set(
      snapshot.entries
        .filter((entry) => entry.kind === MoneyEntryKind.LIQPAY_PAYMENT && entry.paymentId)
        .map((entry) => entry.paymentId as string),
    ),
  ];
  const refundablePayments = paymentIds
    .map((paymentId) => {
      const own = snapshot.entries.filter((entry) => entry.paymentId === paymentId);
      const totals = ledgerTotals(own);
      return {
        paymentId,
        remainingKop: providerRefundAvailableKop({
          paymentInKop: totals.paidKop,
          paymentRefundedKop: totals.refundedKop,
          orderPaidKop: snapshot.paidKop,
          orderRefundedKop: snapshot.refundedKop,
        }),
      };
    })
    .filter((payment) => payment.remainingKop > 0 && heldKop > 0);

  return {
    orderId: snapshot.id,
    orderStatus: snapshot.status,
    paymentStatus: snapshot.paymentStatus,
    paymentMethod: snapshot.paymentMethod,
    deliveryMethod: snapshot.deliveryMethod,
    updatedAt: snapshot.updatedAt,
    totals: {
      totalKop: snapshot.totalKop,
      paidKop: snapshot.paidKop,
      refundedKop: snapshot.refundedKop,
      returnCreditKop: snapshot.returnCreditKop,
      balanceKop: snapshot.balanceKop,
    },
    entries: snapshot.entries,
    allowedInKinds: allowedInKinds(snapshot.paymentMethod, snapshot.deliveryMethod),
    refundablePayments: options.canSeePayments ? refundablePayments : null,
    outWithoutReturnMaxKop: outWithoutReturnMaxKop({
      orderStatus: snapshot.status,
      paidKop: snapshot.paidKop,
      refundedKop: snapshot.refundedKop,
      balanceKop: snapshot.balanceKop,
      outstandingReturnCreditKop: returns.reduce((sum, ret) => sum + ret.owedKop, 0),
    }),
    returns,
  };
}
