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

/** What the service hands the repository to open a return (TASK-340). */
export interface CreateReturnParams {
  orderId: string;
  reason?: string;
  items: Array<{ orderItemId: string; quantity: number }>;
}
