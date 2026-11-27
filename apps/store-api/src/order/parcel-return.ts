import { OrderStatus } from '@prisma/client';

/**
 * «Посилку повернуто на склад» (TASK-2575) — the rule for when a cancelled order's
 * units may be credited back to stock by hand.
 *
 * Stock is decremented when an order is placed. A cancel BEFORE shipment gives it
 * back automatically (`cancelAndRestock`); a cancel AFTER shipment does not, because
 * the parcel is still with the carrier. When a refused parcel physically comes back,
 * the operator records it once, and this decides whether that is allowed. One rule,
 * read by the admin detail (`canReturnParcel`) and enforced by the repository under
 * the order-row lock.
 */

/** Statuses a cancel must have come FROM for the parcel to have left the warehouse. */
const AFTER_SHIPMENT: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
]);

export type ParcelReturnRefusal =
  /** Not CANCELLED, or the latest cancel came from a pre-shipment status. */
  | 'NOT_CANCELLED_AFTER_SHIPMENT'
  /** `restockedAt` is set: the units are on the shelf already. */
  | 'ALREADY_RETURNED'
  /**
   * A return that is not REJECTED exists: resolving it can credit the same units
   * (`ReturnRepository.resolve`), so a parcel return would count them twice.
   */
  | 'HAS_RETURN';

export interface ParcelReturnFacts {
  status: OrderStatus;
  restockedAt: Date | null;
  /** `fromStatus` of the latest STATUS row that moved the order INTO CANCELLED. */
  cancelledFrom: OrderStatus | null;
  /** Whether the order has a return whose status is not REJECTED. */
  hasOpenReturn: boolean;
}

/** Why the parcel may not be returned to stock, or null when it may. */
export function parcelReturnRefusal(facts: ParcelReturnFacts): ParcelReturnRefusal | null {
  if (
    facts.status !== OrderStatus.CANCELLED ||
    facts.cancelledFrom === null ||
    !AFTER_SHIPMENT.has(facts.cancelledFrom)
  ) {
    return 'NOT_CANCELLED_AFTER_SHIPMENT';
  }
  if (facts.restockedAt !== null) {
    return 'ALREADY_RETURNED';
  }
  if (facts.hasOpenReturn) {
    return 'HAS_RETURN';
  }
  return null;
}
