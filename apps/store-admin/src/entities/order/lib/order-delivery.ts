import type {
  OrderEntity,
  OrderEntityDeliveryMethod,
  OrderShippingAddressEntity,
} from "@/shared/api";
import { dict } from "@/shared/config";

/**
 * How an order travels, read the same way by the registry row and the order
 * card (plan 184 U, TASK-648).
 *
 * The order-level `deliveryMethod` is the truth (TASK-642 backfilled it); the
 * snapshot's own copy is the fallback for a payload that lacks it, and
 * NOVA_POSHTA — what every order was before the methods existed — the last.
 */
export function orderDeliveryMethod(
  order: Pick<OrderEntity, "deliveryMethod" | "shippingAddress">,
): OrderEntityDeliveryMethod {
  return (order.deliveryMethod ??
    order.shippingAddress?.deliveryMethod ??
    "NOVA_POSHTA") as OrderEntityDeliveryMethod;
}

/** «Нова Пошта», «Самовивіз», «Курʼєр», «Інша доставка». */
export function deliveryMethodLabel(method: string): string {
  return (
    (dict.orders.deliveryMethodLabels as Record<string, string>)[method] ??
    method
  );
}

/**
 * True when the booked shipping cost is a placeholder the operator will
 * replace — an OTHER order. Read from the method as well as the snapshot flag:
 * a phone order carries no `shippingCostPending` (TASK-1021), only its method.
 */
export function isShippingCostPending(
  order: Pick<OrderEntity, "deliveryMethod" | "shippingAddress">,
): boolean {
  return (
    orderDeliveryMethod(order) === "OTHER" ||
    order.shippingAddress?.shippingCostPending === true
  );
}

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

/** The snapshot's fields as trimmed strings, absent ones as `undefined`. */
export function deliverySnapshot(address: OrderShippingAddressEntity | null) {
  const a = address ?? ({} as Partial<OrderShippingAddressEntity>);
  return {
    firstName: text(a.firstName),
    lastName: text(a.lastName),
    phone: text(a.phone),
    city: text(a.city),
    address1: text(a.address1),
    address2: text(a.address2),
    npWarehouseName: text(a.npWarehouseName),
    pickupPointName: text(a.pickupPointName),
    pickupPointAddress: text(a.pickupPointAddress),
    pickupPointHours: text(a.pickupPointHours),
    pickupPointPhone: text(a.pickupPointPhone),
  };
}
