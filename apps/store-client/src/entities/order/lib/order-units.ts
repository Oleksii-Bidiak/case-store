import type { OrderItemEntity } from "@/shared/api/generated/models";

/**
 * Units on an order — Σ quantity, so «2 × кабель» counts two (TASK-217). The
 * order-history card's «5 товарів» and the detail's «Замовлені товари · 5
 * товарів» read it this way, and so does the cart badge; the thumbnails, one
 * per line, are a different count.
 */
export function orderUnitCount(
  items: readonly Pick<OrderItemEntity, "quantity">[],
): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}
