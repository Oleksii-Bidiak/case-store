import {
  RepairResult,
  ReturnChannel,
  ReturnDecision,
  ReturnOutcome,
  ReturnRepairStep,
  ReturnStatus,
} from '@prisma/client';

/**
 * A staff or customer account as a return names it (TASK-1963): just enough to
 * show a name, with the email as the fallback. Never on a customer read.
 */
export interface ReturnActorRow {
  id: string;
  email: string;
  /**
   * The readable email of a soft-deleted account (TASK-104), whose `email` is
   * mangled to `deleted:<id>:<email>`; null for a live one.
   */
  originalEmail?: string | null;
  firstName: string | null;
  lastName: string | null;
}

/** One row of a return's decision history (TASK-1961, TASK-2044). */
export interface ReturnDecisionEventRow {
  id: string;
  decision: ReturnDecision;
  reason: string | null;
  legacy: boolean;
  createdAt: Date;
  /** Null for backfilled decisions and deleted accounts. */
  actor: ReturnActorRow | null;
}

/**
 * One repair step (TASK-2045). `note` and `actor` are loaded on admin reads only;
 * the customer read selects neither.
 */
export interface ReturnRepairEventRow {
  id: string;
  step: ReturnRepairStep;
  result: RepairResult | null;
  destination: string | null;
  ttn: string | null;
  createdAt: Date;
  note?: string | null;
  actor?: ReturnActorRow | null;
}

/** One order line coming back, as stored on a return (TASK-340). */
export interface ReturnItemRow {
  id: string;
  returnId: string;
  orderItemId: string;
  quantity: number;
  createdAt: Date;
  /**
   * The order line being returned, joined so the admin card can name the product
   * without a second query. Absent on lean reads.
   */
  orderItem?: {
    id: string;
    productId: string;
    quantity: number;
    price: { toString(): string };
    product: { id: string; name: string; slug: string };
  };
}

/** A return request with its lines (TASK-340). */
export interface ReturnWithItems {
  id: string;
  orderId: string;
  status: ReturnStatus;
  reason: string | null;
  /** Operator-only, never shown to the customer (same split as Order.internalNotes). */
  operatorNotes: string | null;
  requestedAt: Date;
  resolvedAt: Date | null;
  /**
   * Non-null once these lines were credited back to sellable stock. Mirrors
   * `Order.restockedAt` so the same "already credited" guard prevents a double
   * restock here too.
   */
  restockedAt: Date | null;
  /** Legacy (pre-R2) amount — no longer written; the ledger holds the payouts. */
  refundedAmount: { toString(): string } | null;
  /**
   * «До повернення» in kopecks (R2, TASK-2046): set when the decision becomes
   * REFUND, null otherwise. Optional only for hand-built fixtures.
   */
  creditKop?: number | null;
  /** Why the operator lowered the credit; null while it is the computed value. */
  creditReason?: string | null;
  /**
   * Who OPENED the request (TASK-469) — the customer's own id from the account
   * page, the operator's id when the shop filed it for them, null for rows that
   * predate the column. Not "whose order this is": that is `order.userId`, and on
   * a guest order it is null while this one names a member of staff.
   */
  createdByUserId: string | null;
  /** The CURRENT decision (TASK-2044); null while nobody has decided. */
  decision: ReturnDecision | null;
  /** Why — customer-facing, unlike `operatorNotes`. */
  decisionReason: string | null;
  decidedAt: Date | null;
  /** Who decided; null for backfilled (legacy) decisions and deleted accounts. */
  decidedById: string | null;
  /** True when the decision was inferred by the R1 backfill (no reason, no author). */
  decisionLegacy: boolean;
  /** What the customer asked for (TASK-2044); null on pre-B-12 requests. */
  requestedOutcome: ReturnOutcome | null;
  /** Which door the request came through (TASK-1963). */
  channel: ReturnChannel;
  createdAt: Date;
  updatedAt: Date;
  items: ReturnItemRow[];
  /** Owning order, joined on admin reads so the card can show whose return it is. */
  order?: {
    id: string;
    userId: string | null;
    guestEmail: string | null;
    status: string;
    /** The purchase date — the 14-day clock starts there (TASK-1963). */
    createdAt?: Date;
  };
  /** Admin reads only (TASK-1963). Undefined when not joined; null when gone. */
  createdBy?: ReturnActorRow | null;
  /** Admin reads only (TASK-1963). Undefined when not joined; null when gone. */
  decidedBy?: ReturnActorRow | null;
  /** Admin single-return reads only; oldest first. */
  decisionEvents?: ReturnDecisionEventRow[];
  /** Customer reads (lean) and admin single-return reads (full); oldest first. */
  repairEvents?: ReturnRepairEventRow[];
}

/**
 * One earlier return as the claim check sees it (TASK-784): its status, because a
 * REJECTED return releases its units, and how many of each order line it holds.
 */
export interface ReturnClaimRow {
  status: ReturnStatus;
  items: Array<{ orderItemId: string; quantity: number }>;
}

/**
 * The service's "no more than was bought" rule, run by the repository INSIDE the
 * transaction that inserts the return, against a ledger read under a lock on the
 * order row (TASK-784). Throwing aborts the insert.
 */
export type AssertReturnClaimable = (ledger: ReturnClaimRow[]) => void;

/**
 * The state the service validated a transition against — a decision or a PATCH
 * (TASK-1961, TASK-2044). The repository writes only if the row still holds
 * this status and decision, so neither lands on a return another operator has
 * moved meanwhile.
 */
export interface ReturnTransitionBasis {
  id: string;
  orderId: string;
  status: ReturnStatus;
  decision: ReturnDecision | null;
}

/** What a decision writes onto the return and into its history row. */
export interface ReturnDecisionChange {
  status: ReturnStatus;
  decision: ReturnDecision;
  decisionReason: string | null;
  decidedById: string;
  decidedAt: Date;
}

/** One repair step as the service hands it to the repository (TASK-2045). */
export interface ReturnRepairStepRecord {
  step: ReturnRepairStep;
  result: RepairResult | null;
  destination: string | null;
  ttn: string | null;
  note: string | null;
  actorId: string;
  createdAt: Date;
}

/** What the service hands the repository to open a return (TASK-340). */
export interface CreateReturnParams {
  orderId: string;
  reason?: string;
  /** Whoever pressed the button — customer or operator (TASK-469). */
  createdByUserId?: string | null;
  /** What the customer asked for (TASK-2044); omitted = they did not say. */
  requestedOutcome?: ReturnOutcome;
  /** Which door the request came through (TASK-1963) — set by the service, never inferred. */
  channel: ReturnChannel;
  items: Array<{ orderItemId: string; quantity: number }>;
}

/**
 * What a decision does to the return's credit («до повернення», R2 A3,
 * TASK-2046): `compute` when the decision BECOMES a refund (the lines' value
 * less their promo share, under the order lock), `clear` when it stops being
 * one. A re-worded refund keeps its credit.
 */
export type ReturnCreditEffect = 'compute' | 'clear';

/** Extra work `ReturnRepository.decide` does inside its locked transaction. */
export interface ReturnDecideOptions {
  assertClaimable?: AssertReturnClaimable;
  /** Refuse (RETURN_REFUND_RECORDED) when payouts are recorded on this return. */
  refuseIfPaidOut?: boolean;
  credit?: ReturnCreditEffect;
  /** Who decided — the author of the order's PAYMENT_STATUS row, if one follows. */
  actorId?: string;
}

/** The two numbers a credit change is measured against, read under the order lock. */
export interface ReturnCreditCeilings {
  /** The credit as `returnCreditFor` computes it now. */
  computedKop: number;
  /** Σ payouts on this return, net of reversals, voided ignored. */
  paidOutKop: number;
}

/** The service's reduce-only rule, run by the repository against fresh ceilings. */
export type AssertReturnCredit = (ceilings: ReturnCreditCeilings) => void;
