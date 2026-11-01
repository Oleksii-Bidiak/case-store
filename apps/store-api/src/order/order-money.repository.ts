import { Injectable, NotFoundException } from '@nestjs/common';
import {
  DeliveryMethod,
  MoneyDirection,
  MoneyEntryKind,
  MoneyProviderState,
  OrderHistoryChangeType,
  OrderHistoryNote,
  OrderStatus,
  PaymentAttemptStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  ReturnDecision,
  ReturnStatus,
} from '@prisma/client';
import { toCents } from '../addon-service';
import { PrismaService } from '../prisma';
import {
  canReverse,
  deriveBalance,
  deriveOrderStatus,
  derivePaymentStatus,
  directionOf,
  ledgerTotals,
  returnStatusAfterPayouts,
  reversalDraft,
  type LedgerRow,
} from './order-money';
import { DERIVED_REFUNDED_FROM } from './order-state-machine';
import {
  moneyEntryInvalidError,
  moneyReceiptReversalBelowRefundedError,
  moneyRefundExceedsPaidError,
  moneyReversalRefusedError,
} from './order.errors';

type Tx = Prisma.TransactionClient;

/** The order row as a money transaction sees it, under its lock. Kopecks only. */
export interface LockedOrder {
  id: string;
  totalKop: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  deliveryMethod: DeliveryMethod;
  /** The optimistic-lock token of the operator's screen (`assertFresh`, R2 A3). */
  updatedAt: Date;
}

/** One ledger row, as the domain reads it (not the Prisma model). */
export interface MoneyEntry {
  id: string;
  orderId: string;
  direction: MoneyDirection;
  kind: MoneyEntryKind;
  amountKop: number;
  returnId: string | null;
  paymentId: string | null;
  providerRef: string | null;
  providerState: MoneyProviderState | null;
  actorId: string | null;
  reason: string | null;
  reversalOfId: string | null;
  voidedAt: Date | null;
  voidReason: string | null;
  legacy: boolean;
  occurredAt: Date;
  createdAt: Date;
}

export interface NewMoneyEntry {
  orderId: string;
  /** The direction follows from the kind (`directionOf`) — never passed separately. */
  kind: MoneyEntryKind;
  amountKop: number;
  returnId?: string | null;
  paymentId?: string | null;
  providerRef?: string | null;
  providerState?: MoneyProviderState | null;
  /** Null for LiqPay/system writes. */
  actorId?: string | null;
  reason?: string | null;
  /** When the money actually moved; defaults to now. */
  occurredAt?: Date;
}

export interface ReverseMoneyEntry {
  orderId: string;
  entryId: string;
  actorId: string | null;
  /** Required: a reversal without a why is an edit, not a correction. */
  reason: string;
  occurredAt?: Date;
}

/** A return's money as a payout reads it (R2 A3). */
export interface ReturnMoneyRow {
  id: string;
  status: ReturnStatus;
  decision: ReturnDecision | null;
  creditKop: number | null;
  /** Σ of its payouts, net of reversals, voided ignored (REQUESTED counts). */
  paidOutKop: number;
}

/** What the payout and receipt rules read under the order lock (R2 A3). */
export interface MoneyBasis {
  paidKop: number;
  refundedKop: number;
  /** Every return of the order. */
  returns: ReturnMoneyRow[];
}

/** A ledger row for the operator's journal: who wrote it, and what reversed it. */
export interface MoneyEntryRow extends MoneyEntry {
  /** First and last name, or the email; null for LiqPay/system rows and deleted accounts. */
  actorName: string | null;
  reversedById: string | null;
}

/** Everything `GET /admin/orders/:orderId/money` is built from (R2 A3). */
export interface OrderMoneySnapshot {
  id: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  deliveryMethod: DeliveryMethod;
  totalKop: number;
  paidKop: number;
  refundedKop: number;
  returnCreditKop: number;
  balanceKop: number;
  updatedAt: Date;
  /** Oldest first: by when the money moved, then by when it was written. */
  entries: MoneyEntryRow[];
  /** The order's REFUND-decided returns (those with a credit). */
  returns: Array<{
    id: string;
    status: ReturnStatus;
    decision: ReturnDecision | null;
    creditKop: number | null;
    creditReason: string | null;
  }>;
}

/** An account as the journal names it. */
const ACTOR_SELECT = {
  email: true,
  originalEmail: true,
  firstName: true,
  lastName: true,
} satisfies Prisma.UserSelect;

/** The order's money as it stands after {@link OrderMoneyRepository.recompute}. */
export interface MoneyTotals {
  paidKop: number;
  refundedKop: number;
  returnCreditKop: number;
  balanceKop: number;
  paymentStatus: PaymentStatus;
  /** The order status after the derivation (TASK-1969). */
  status: OrderStatus;
}

/**
 * The order money ledger's persistence (TASK-2047 / TASK-2046 / TASK-951; R2
 * "payment from one place").
 *
 * ── The one rule every caller follows ────────────────────────────────────────
 * Every money transaction locks the ORDER row first ({@link transaction} does it
 * for you; {@link lockOrder} if you already hold a tx). One lock order for every
 * writer — webhook, operator, cron — means no deadlock between them, and the
 * ceiling `paid − refunded` read after the lock cannot be raced: two payouts that
 * together exceed what came in serialise, and the second one is refused.
 *
 * The rules themselves (status, balance, reversals) are pure and live in
 * `order-money.ts`; this class only reads and writes rows. The four totals on
 * `orders` are written ONLY by {@link recompute}, in the same transaction as the
 * entry that changed them.
 */
@Injectable()
export class OrderMoneyRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Run `body` in a transaction whose first statement locks the order row. */
  async transaction<T>(
    orderId: string,
    body: (tx: Tx, order: LockedOrder) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.lockOrder(tx, orderId);
      return body(tx, order);
    });
  }

  /** `SELECT … FOR UPDATE` of the order row — the first statement of a money tx. */
  async lockOrder(tx: Tx, orderId: string): Promise<LockedOrder> {
    const [row] = await tx.$queryRaw<
      Array<{
        id: string;
        total: Prisma.Decimal;
        status: OrderStatus;
        payment_status: PaymentStatus;
        payment_method: PaymentMethod;
        delivery_method: DeliveryMethod;
        updated_at: Date;
      }>
    >`SELECT "id", "total", "status", "payment_status", "payment_method", "delivery_method",
             "updated_at"
        FROM "orders" WHERE "id" = ${orderId} FOR UPDATE`;
    if (!row) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }
    return {
      id: row.id,
      totalKop: toCents(row.total),
      status: row.status,
      paymentStatus: row.payment_status,
      paymentMethod: row.payment_method,
      deliveryMethod: row.delivery_method,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Append one entry. An OUT entry is refused (409) above `paid − refunded`
   * across every kind — the TASK-951 ceiling. Call under {@link lockOrder}.
   */
  async insertEntry(tx: Tx, input: NewMoneyEntry): Promise<MoneyEntry> {
    assertAmount(input.amountKop);
    const direction = directionOf(input.kind);

    if (direction === MoneyDirection.OUT) {
      const { paidKop, refundedKop } = await this.totalsFromLedger(tx, input.orderId);
      const availableKop = paidKop - refundedKop;
      if (input.amountKop > availableKop) {
        throw moneyRefundExceedsPaidError(input.amountKop, availableKop);
      }
    }

    const row = await tx.orderMoneyEntry.create({
      data: {
        orderId: input.orderId,
        direction,
        kind: input.kind,
        amountKop: input.amountKop,
        returnId: input.returnId ?? null,
        paymentId: input.paymentId ?? null,
        providerRef: input.providerRef ?? null,
        providerState: input.providerState ?? null,
        actorId: input.actorId ?? null,
        reason: input.reason ?? null,
        occurredAt: input.occurredAt ?? new Date(),
      },
    });
    return toMoneyEntry(row);
  }

  /**
   * Reverse (сторнувати) an entry: a new row of the same direction, kind and
   * amount pointing back at it. Refused for LiqPay rows, reversals, voided rows,
   * a second reversal, and — for a receipt — when the payouts already made
   * depend on it. Call under {@link lockOrder}.
   */
  async reverseEntry(tx: Tx, input: ReverseMoneyEntry): Promise<MoneyEntry> {
    const reason = input.reason.trim();
    if (reason.length === 0) {
      throw moneyEntryInvalidError('A reversal needs a reason');
    }

    const original = await tx.orderMoneyEntry.findFirst({
      where: { id: input.entryId, orderId: input.orderId },
      include: { reversedBy: { select: { id: true } } },
    });
    if (!original) {
      throw new NotFoundException(`Money entry ${input.entryId} not found on this order`);
    }

    const reversible = { ...original, reversed: original.reversedBy !== null };
    const verdict = canReverse(reversible);
    if (!verdict.ok) {
      throw moneyReversalRefusedError(verdict.reason);
    }

    if (original.direction === MoneyDirection.IN) {
      const { paidKop, refundedKop } = await this.totalsFromLedger(tx, input.orderId);
      if (paidKop - original.amountKop < refundedKop) {
        throw moneyReceiptReversalBelowRefundedError(original.amountKop, refundedKop);
      }
    }

    const draft = reversalDraft(reversible);
    const row = await tx.orderMoneyEntry.create({
      data: {
        orderId: input.orderId,
        direction: draft.direction,
        kind: draft.kind,
        amountKop: draft.amountKop,
        reversalOfId: draft.reversalOfId,
        returnId: original.returnId,
        actorId: input.actorId,
        reason,
        occurredAt: input.occurredAt ?? new Date(),
      },
    });
    return toMoneyEntry(row);
  }

  /**
   * Recalculate the four totals on the order from its ledger and returns, derive
   * the payment status, and — when it changed — write a PAYMENT_STATUS history row
   * (same shape as `OrderRepository.applyPaymentOutcome`). Call under
   * {@link lockOrder}, after the entries of this transaction are written.
   */
  async recompute(
    tx: Tx,
    orderId: string,
    actorId: string | null,
    options: {
      note?: OrderHistoryNote;
      /**
       * This transaction took a payout back (a reversal of an OUT entry, or a
       * void of a REQUESTED refund) — the only event that may move a REFUNDED
       * order back (`deriveOrderStatus`, TASK-1969).
       */
      payoutUndone?: boolean;
    } = {},
  ): Promise<MoneyTotals> {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { total: true, status: true, paymentStatus: true },
    });
    const rows = await tx.orderMoneyEntry.findMany({
      where: { orderId },
      select: {
        direction: true,
        amountKop: true,
        reversalOfId: true,
        voidedAt: true,
        returnId: true,
      },
    });
    const { paidKop, refundedKop } = ledgerTotals(rows);
    const status = await this.deriveStatus(tx, order.status, {
      orderId,
      refundedKop,
      rows,
      payoutUndone: options.payoutUndone === true,
    });
    // A refund label the backfill could not put an amount behind is kept until
    // real money out is recorded (see `PaymentStatusInput.legacyRefundLabel`).
    const legacyUnknown =
      refundedKop <= 0 &&
      (await tx.orderStatusHistory.count({
        where: { orderId, note: OrderHistoryNote.LEGACY_MONEY_UNKNOWN },
      })) > 0;
    const credit = await tx.return.aggregate({
      where: { orderId, creditKop: { not: null } },
      _sum: { creditKop: true },
    });
    const returnCreditKop = credit._sum.creditKop ?? 0;
    const lastAttempt = await tx.payment.findFirst({
      where: { orderId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { status: true },
    });

    const totalKop = toCents(order.total);
    const paymentStatus = derivePaymentStatus({
      totalKop,
      paidKop,
      refundedKop,
      lastAttemptFailed: lastAttempt?.status === PaymentAttemptStatus.FAILED,
      legacyRefundLabel: legacyUnknown ? order.paymentStatus : null,
    });
    const balanceKop = deriveBalance({
      totalKop,
      returnCreditKop,
      paidKop,
      refundedKop,
      orderStatus: status,
    });

    await tx.order.update({
      where: { id: orderId },
      data: { paidKop, refundedKop, returnCreditKop, balanceKop, paymentStatus, status },
    });

    // TASK-1969: the order's own REFUNDED moved with the money — one STATUS row,
    // authored by whoever wrote the money (null for LiqPay / the system).
    if (status !== order.status) {
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          changeType: OrderHistoryChangeType.STATUS,
          fromStatus: order.status,
          toStatus: status,
          changedBy: actorId,
        },
      });
    }

    if (paymentStatus !== order.paymentStatus) {
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          changeType: OrderHistoryChangeType.PAYMENT_STATUS,
          fromPaymentStatus: order.paymentStatus,
          toPaymentStatus: paymentStatus,
          ...(options.note ? { note: options.note } : {}),
          changedBy: actorId,
        },
      });
    }

    return { paidKop, refundedKop, returnCreditKop, balanceKop, paymentStatus, status };
  }

  /**
   * The order status its ledger implies (`deriveOrderStatus`, TASK-1969). Reads
   * the lines and the REFUND-decided returns only when the answer can change:
   * a SHIPPED/DELIVERED order, or a REFUNDED one after a payout was undone.
   */
  private async deriveStatus(
    tx: Tx,
    current: OrderStatus,
    input: {
      orderId: string;
      refundedKop: number;
      rows: ReadonlyArray<LedgerRow & { returnId: string | null }>;
      payoutUndone: boolean;
    },
  ): Promise<OrderStatus> {
    const mayMove =
      DERIVED_REFUNDED_FROM.includes(current) ||
      (current === OrderStatus.REFUNDED && input.payoutUndone);
    if (!mayMove) {
      return current;
    }
    const { orderId, refundedKop, rows, payoutUndone } = input;
    const lines = await tx.orderItem.findMany({
      where: { orderId },
      select: { id: true, quantity: true },
    });
    const returns = await tx.return.findMany({
      where: { orderId, decision: ReturnDecision.REFUND },
      select: {
        id: true,
        creditKop: true,
        items: { select: { orderItemId: true, quantity: true } },
      },
    });
    const lastIntoRefunded =
      current === OrderStatus.REFUNDED
        ? await tx.orderStatusHistory.findFirst({
            where: {
              orderId,
              changeType: OrderHistoryChangeType.STATUS,
              toStatus: OrderStatus.REFUNDED,
            },
            orderBy: [{ changedAt: 'desc' }, { id: 'desc' }],
            select: { fromStatus: true },
          })
        : null;
    return deriveOrderStatus({
      orderStatus: current,
      refundedKop,
      lines,
      refundReturns: returns.map((ret) => ({
        creditKop: ret.creditKop,
        items: ret.items,
        paidOutKop: ledgerTotals(rows.filter((row) => row.returnId === ret.id)).refundedKop,
      })),
      payoutUndone,
      refundedFrom: lastIntoRefunded?.fromStatus ?? null,
    });
  }

  // ── The LiqPay path (TASK-1500 / TASK-2047, R2 step A2) ────────────────────
  //
  // A LiqPay refund is written the moment WE request it — OUT `LIQPAY_REFUND`,
  // `providerState = REQUESTED` — and it COUNTS in `refundedKop` from then on:
  // the money is committed to leave, and counting it is what makes the ceiling
  // hold for a second request made before the provider answers the first. The
  // `reversed` callback (or the reconcile poll) only flips it to CONFIRMED; a
  // provider refusal VOIDS it, and a voided row never counts.

  /** The attempt's row with this provider discriminator ('success' = its receipt). */
  async findProviderEntry(
    tx: Tx,
    paymentId: string,
    providerRef: string,
  ): Promise<MoneyEntry | null> {
    const row = await tx.orderMoneyEntry.findUnique({
      where: { paymentId_providerRef: { paymentId, providerRef } },
    });
    return row ? toMoneyEntry(row) : null;
  }

  /**
   * One attempt's own money: its receipt and its LiqPay refunds that are not
   * voided (REQUESTED included — see the section note). Kopecks.
   */
  async paymentProviderTotals(
    tx: Tx,
    paymentId: string,
  ): Promise<{ inKop: number; refundedKop: number }> {
    const rows = await tx.orderMoneyEntry.findMany({
      where: {
        paymentId,
        kind: { in: [MoneyEntryKind.LIQPAY_PAYMENT, MoneyEntryKind.LIQPAY_REFUND] },
      },
      select: { direction: true, amountKop: true, reversalOfId: true, voidedAt: true },
    });
    const { paidKop, refundedKop } = ledgerTotals(rows);
    return { inKop: paidKop, refundedKop };
  }

  /**
   * Mark the attempt's oldest live REQUESTED refund CONFIRMED and return it, or
   * null when there is none. Conditional on the state, so a repeat is a no-op.
   * Call under {@link lockOrder}.
   */
  async confirmOldestRequestedRefund(tx: Tx, paymentId: string): Promise<MoneyEntry | null> {
    const oldest = await tx.orderMoneyEntry.findFirst({
      where: {
        paymentId,
        kind: MoneyEntryKind.LIQPAY_REFUND,
        providerState: MoneyProviderState.REQUESTED,
        voidedAt: null,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    if (!oldest) {
      return null;
    }
    const { count } = await tx.orderMoneyEntry.updateMany({
      where: { id: oldest.id, providerState: MoneyProviderState.REQUESTED, voidedAt: null },
      data: { providerState: MoneyProviderState.CONFIRMED },
    });
    return count === 1
      ? toMoneyEntry({ ...oldest, providerState: MoneyProviderState.CONFIRMED })
      : null;
  }

  /**
   * Void a REQUESTED refund the provider refused — it never moved money. False
   * when it is already voided or confirmed. Call under {@link lockOrder}, then
   * {@link recompute}.
   */
  async voidEntry(tx: Tx, entryId: string, reason: string): Promise<boolean> {
    const { count } = await tx.orderMoneyEntry.updateMany({
      where: { id: entryId, voidedAt: null, providerState: MoneyProviderState.REQUESTED },
      data: { voidedAt: new Date(), voidReason: reason },
    });
    return count === 1;
  }

  // ── The operator's door (R2 step A3) ───────────────────────────────────────

  /**
   * What the payout and receipt rules read: the order's ledger totals and every
   * return with what has been paid out on it. Call under {@link lockOrder}.
   */
  async readBasis(tx: Tx, orderId: string): Promise<MoneyBasis> {
    // Sequential: one transaction is one connection — no parallel queries on it.
    const rows = await tx.orderMoneyEntry.findMany({
      where: { orderId },
      select: {
        direction: true,
        amountKop: true,
        reversalOfId: true,
        voidedAt: true,
        returnId: true,
      },
    });
    const returns = await tx.return.findMany({
      where: { orderId },
      select: { id: true, status: true, decision: true, creditKop: true },
      orderBy: [{ requestedAt: 'asc' }, { id: 'asc' }],
    });
    const { paidKop, refundedKop } = ledgerTotals(rows);
    return {
      paidKop,
      refundedKop,
      returns: returns.map((ret) => ({
        ...ret,
        paidOutKop: ledgerTotals(rows.filter((row) => row.returnId === ret.id)).refundedKop,
      })),
    };
  }

  /** One entry of this order, or null. */
  async findEntry(tx: Tx, orderId: string, entryId: string): Promise<MoneyEntry | null> {
    const row = await tx.orderMoneyEntry.findFirst({ where: { id: entryId, orderId } });
    return row ? toMoneyEntry(row) : null;
  }

  /**
   * Re-derive a return's status from its payouts (TASK-2046): RECEIVED ⇄
   * REFUNDED, `returnStatusAfterPayouts`. Conditional on the status read here,
   * stamping `resolvedAt` ("the last change") as R1 does for every status move.
   * Call under {@link lockOrder}, after the entries of this transaction.
   */
  async syncReturnStatus(tx: Tx, returnId: string): Promise<ReturnStatus | null> {
    const ret = await tx.return.findUnique({
      where: { id: returnId },
      select: { status: true, decision: true, creditKop: true },
    });
    if (!ret) {
      return null;
    }
    const next = returnStatusAfterPayouts({
      ...ret,
      paidOutKop: await this.returnPaidOutKop(tx, returnId),
    });
    if (next !== ret.status) {
      await tx.return.updateMany({
        where: { id: returnId, status: ret.status },
        data: { status: next, resolvedAt: new Date() },
      });
    }
    return next;
  }

  /** Σ payouts on one return, net of reversals, voided ignored (REQUESTED counts). */
  async returnPaidOutKop(tx: Tx, returnId: string): Promise<number> {
    const rows = await tx.orderMoneyEntry.findMany({
      where: { returnId, direction: MoneyDirection.OUT },
      select: { direction: true, amountKop: true, reversalOfId: true, voidedAt: true },
    });
    return ledgerTotals(rows).refundedKop;
  }

  /** Everything the operator's money view is built from, or null for an unknown order. */
  async findSnapshot(orderId: string): Promise<OrderMoneySnapshot | null> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        paymentMethod: true,
        deliveryMethod: true,
        total: true,
        paidKop: true,
        refundedKop: true,
        returnCreditKop: true,
        balanceKop: true,
        updatedAt: true,
        moneyEntries: {
          orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
          include: {
            actor: { select: ACTOR_SELECT },
            reversedBy: { select: { id: true } },
          },
        },
        returns: {
          where: { creditKop: { not: null } },
          orderBy: [{ requestedAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            status: true,
            decision: true,
            creditKop: true,
            creditReason: true,
          },
        },
      },
    });
    if (!order) {
      return null;
    }
    const { moneyEntries, total, ...rest } = order;
    return {
      ...rest,
      totalKop: toCents(total),
      entries: moneyEntries.map(({ actor, reversedBy, ...row }) => ({
        ...toMoneyEntry(row),
        actorName: actor ? actorDisplayName(actor) : null,
        reversedById: reversedBy?.id ?? null,
      })),
    };
  }

  /** Σ IN and Σ OUT of the order straight from its ledger. Call under {@link lockOrder}. */
  async totalsFromLedger(
    tx: Tx,
    orderId: string,
  ): Promise<{ paidKop: number; refundedKop: number }> {
    const rows = await tx.orderMoneyEntry.findMany({
      where: { orderId },
      select: { direction: true, amountKop: true, reversalOfId: true, voidedAt: true },
    });
    return ledgerTotals(rows);
  }
}

function assertAmount(amountKop: number): void {
  if (!Number.isSafeInteger(amountKop) || amountKop <= 0) {
    throw moneyEntryInvalidError(
      `Amount must be a positive whole number of kopecks, got ${amountKop}`,
    );
  }
}

/** Same rule as the returns card: the name, or the readable email (TASK-104). */
function actorDisplayName(actor: {
  email: string;
  originalEmail: string | null;
  firstName: string | null;
  lastName: string | null;
}): string {
  const name = [actor.firstName, actor.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');
  return name || (actor.originalEmail ?? actor.email);
}

function toMoneyEntry(row: Prisma.OrderMoneyEntryGetPayload<object>): MoneyEntry {
  return {
    id: row.id,
    orderId: row.orderId,
    direction: row.direction,
    kind: row.kind,
    amountKop: row.amountKop,
    returnId: row.returnId,
    paymentId: row.paymentId,
    providerRef: row.providerRef,
    providerState: row.providerState,
    actorId: row.actorId,
    reason: row.reason,
    reversalOfId: row.reversalOfId,
    voidedAt: row.voidedAt,
    voidReason: row.voidReason,
    legacy: row.legacy,
    occurredAt: row.occurredAt,
    createdAt: row.createdAt,
  };
}
