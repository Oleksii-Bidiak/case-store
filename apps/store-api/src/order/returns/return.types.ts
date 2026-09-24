import { ReturnStatus } from '@prisma/client';

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
  refundedAmount: { toString(): string } | null;
  /**
   * Who OPENED the request (TASK-469) — the customer's own id from the account
   * page, the operator's id when the shop filed it for them, null for rows that
   * predate the column. Not "whose order this is": that is `order.userId`, and on
   * a guest order it is null while this one names a member of staff.
   */
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: ReturnItemRow[];
  /** Owning order, joined on admin reads so the card can show whose return it is. */
  order?: {
    id: string;
    userId: string | null;
    guestEmail: string | null;
    status: string;
  };
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
 * What the refund ceilings are measured against (TASK-785), read by the
 * repository INSIDE the resolve transaction under a lock on the order row.
 */
export interface RefundLedger {
  /** `Order.total` — what the customer actually paid, discount and shipping included. */
  orderTotal: { toString(): string };
  /**
   * Every OTHER return of the order, whatever its status: money recorded as paid
   * out is gone whether the return was later rejected or not. This return is
   * left out because its own amount is the one being replaced.
   */
  otherRefunds: Array<{ refundedAmount: { toString(): string } | null }>;
  /** This return's lines, priced at the order line's unit price. */
  items: Array<{ quantity: number; unitPrice: { toString(): string } }>;
}

/**
 * The service's refund ceilings, run by the repository against a
 * {@link RefundLedger} inside the resolve transaction (TASK-785). Throwing aborts
 * the write.
 */
export type AssertRefundWithinBalance = (ledger: RefundLedger) => void;

/** What the service hands the repository to open a return (TASK-340). */
export interface CreateReturnParams {
  orderId: string;
  reason?: string;
  /** Whoever pressed the button — customer or operator (TASK-469). */
  createdByUserId?: string | null;
  items: Array<{ orderItemId: string; quantity: number }>;
}
