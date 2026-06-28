import { OrderEntityStatus } from "@/entities/order";

type OrderStatus = (typeof OrderEntityStatus)[keyof typeof OrderEntityStatus];

const ALL_STATUSES = Object.values(OrderEntityStatus) as OrderStatus[];

/**
 * Statuses an admin may move an order to from its current status.
 *
 * TASK-151: the admin has full manual control — any status is a valid target.
 * The only value omitted is the order's CURRENT status (the dropdown is a
 * "move to" picker; re-selecting the current status would be a no-op). The
 * previous forward-only `ORDER_STATUS_TRANSITIONS` map is removed; transition
 * sensibility is now the admin's responsibility, not a UI guard.
 */
export function getAllowedTransitions(current: string): OrderStatus[] {
  return ALL_STATUSES.filter((status) => status !== current);
}
