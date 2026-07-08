import { OrderEntityStatus } from "@/shared/api";

/**
 * Frontend mirror of the backend `PRE_SHIPMENT_STATUSES` set (TASK-254): the
 * order statuses whose stock is still reserved in the warehouse (not yet
 * shipped). Used by the order-detail widget to decide whether an order is
 * currently holding stock. Kept one-for-one with the backend set — a future
 * status added to one side without the other is caught by this helper's
 * table-driven unit test.
 */
const PRE_SHIPMENT_STATUSES: ReadonlySet<string> = new Set([
  OrderEntityStatus.PENDING,
  OrderEntityStatus.CONFIRMED,
  OrderEntityStatus.PROCESSING,
]);

/** Whether an order in `status` still holds reserved stock (pre-shipment). */
export function isPreShipmentStatus(status: string): boolean {
  return PRE_SHIPMENT_STATUSES.has(status);
}
