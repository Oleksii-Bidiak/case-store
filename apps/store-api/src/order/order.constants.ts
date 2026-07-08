import { OrderStatus } from '@prisma/client';

/**
 * Order statuses whose stock is still in the warehouse (reserved at creation,
 * not yet shipped to the customer). Cancelling an order from one of these
 * states can safely return the reserved stock to inventory automatically.
 *
 * Single source of truth for "which order statuses still hold stock" — shared
 * by the auto-restock guard (`order.service.ts` `shouldAutoRestock`) and the
 * derived reserved-qty aggregate (`ProductRepository.getReservedQtyByProductId`,
 * TASK-254), so the two never drift apart.
 */
export const PRE_SHIPMENT_STATUSES: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
]);
