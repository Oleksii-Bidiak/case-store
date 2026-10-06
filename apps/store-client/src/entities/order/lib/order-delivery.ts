import type { OrderEntity } from "@/shared/api/generated/models";

/**
 * The address snapshot as the API stores it. Orval now types it as
 * `OrderShippingAddressEntity` (TASK-1023), but it really does come in two shapes:
 *
 * - what the checkout writes (`AddressDto` + the server's delivery fields):
 *   `firstName`, `lastName`, `phone`, `city`, `address1` (the branch or the
 *   street), `npWarehouseName` for a branch picked from the autocomplete,
 *   `pickupPointName` / `pickupPointAddress` for a pickup point,
 *   `shippingCostPending` for a delivery the operator still has to price;
 * - what the demo seeder writes: `recipient`, `city`, `warehouse`.
 *
 * Every field is read as "a non-empty string or nothing".
 */
type AddressSnapshot = Record<string, unknown>;

function text(address: AddressSnapshot, key: string): string | null {
  const value = address[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Which row label the delivery point goes under. */
export type OrderDeliveryPlaceKind = "warehouse" | "pickup" | "address";

export interface OrderDeliveryDetails {
  recipient: string | null;
  phone: string | null;
  city: string | null;
  place: { kind: OrderDeliveryPlaceKind; value: string } | null;
  /** The booked `shippingCost` of 0 is a placeholder, not a free delivery. */
  shippingCostPending: boolean;
}

/**
 * The «Доставка» block of the account order detail (TASK-217), read from the
 * order's address snapshot: who receives it, in which city, and where — a Nova
 * Poshta branch, a pickup point or a street address, depending on
 * `deliveryMethod`. The owner sees their own street here; it is the public
 * `/orders/status` projection that must never carry it.
 */
export function orderDeliveryDetails(
  order: Pick<OrderEntity, "deliveryMethod"> & {
    // Wider than the generated type on purpose: the seeded shape is not in it.
    shippingAddress: OrderEntity["shippingAddress"] | AddressSnapshot;
  },
): OrderDeliveryDetails {
  const address = (order.shippingAddress ?? {}) as AddressSnapshot;

  const name = [text(address, "firstName"), text(address, "lastName")]
    .filter(Boolean)
    .join(" ");

  const street = [text(address, "address1"), text(address, "address2")]
    .filter(Boolean)
    .join(", ");

  let place: OrderDeliveryDetails["place"] = null;
  if (order.deliveryMethod === "PICKUP") {
    const point = [
      text(address, "pickupPointName"),
      text(address, "pickupPointAddress"),
    ]
      .filter(Boolean)
      .join(", ");
    const value = point || street;
    if (value) place = { kind: "pickup", value };
  } else if (order.deliveryMethod === "NOVA_POSHTA") {
    const value =
      text(address, "npWarehouseName") ?? text(address, "warehouse") ?? street;
    if (value) place = { kind: "warehouse", value };
  } else if (street) {
    place = { kind: "address", value: street };
  }

  return {
    recipient: name || text(address, "recipient"),
    phone: text(address, "phone"),
    city: text(address, "city"),
    place,
    shippingCostPending: address.shippingCostPending === true,
  };
}
