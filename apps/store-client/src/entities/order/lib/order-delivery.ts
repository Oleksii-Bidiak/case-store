import type { OrderEntity } from "@/shared/api/generated/models";

/**
 * The address snapshot as the API stores it. Orval now types it as
 * `OrderShippingAddressEntity` (TASK-1023), but it really does come in two shapes:
 *
 * - what the checkout writes (`AddressDto` + the server's delivery fields):
 *   `firstName`, `lastName`, `phone`, `city`, `address1` (the branch or the
 *   street), `npWarehouseName` for a branch picked from the autocomplete,
 *   `pickupPoint*` for a pickup point (TASK-643: name, address, hours, phone,
 *   map link — a snapshot taken at checkout), `shippingCostPending` for a
 *   delivery the operator still has to price;
 * - what the demo seeder writes: `recipient`, `city`, `warehouse`.
 *
 * Every field is read as "a non-empty string or nothing".
 */
type AddressSnapshot = Record<string, unknown>;

function text(address: AddressSnapshot, key: string): string | null {
  const value = address[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * The owner types the map link by hand in the admin panel. Only an http(s) URL
 * becomes an `href` — a `javascript:` string never reaches the DOM.
 */
function httpUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? value : null;
  } catch {
    return null;
  }
}

/** Which row label the delivery point goes under. */
export type OrderDeliveryPlaceKind = "warehouse" | "pickup" | "address";

/** The pickup point as it was at checkout (PICKUP orders only). */
export interface OrderPickupPointSnapshot {
  name: string | null;
  address: string | null;
  hours: string | null;
  phone: string | null;
  /** Safe to put in an `href`: http(s) only. */
  mapUrl: string | null;
}

export interface OrderDeliveryDetails {
  method: OrderEntity["deliveryMethod"];
  recipient: string | null;
  phone: string | null;
  city: string | null;
  place: { kind: OrderDeliveryPlaceKind; value: string } | null;
  /** `address1, address2` as typed — the courier street or the OTHER text. */
  street: string | null;
  pickup: OrderPickupPointSnapshot | null;
  /**
   * The booked `shippingCost` of 0 is a placeholder, not a free delivery —
   * render «Уточнить оператор», never «Безкоштовно» / «0 ₴».
   */
  shippingCostPending: boolean;
}

/**
 * Whether a booked 0 is "nobody priced it" — the API's own rule
 * (`isShippingCostPending` in store-api `public-order.entity.ts`, and the
 * order-confirmation letter): any non-zero cost is a price; a zero is free
 * only for the two methods that can be free (PICKUP always, COURIER above its
 * threshold). For NOVA_POSHTA and OTHER a 0 means the cost was never computed
 * — an NP estimate that failed at checkout, an order taken by phone, a legacy
 * free-text-city order. Without the booked cost only the snapshot flag counts.
 */
function isShippingCostPending(
  method: OrderEntity["deliveryMethod"],
  flagged: boolean,
  shippingCost: string | undefined,
): boolean {
  if (shippingCost === undefined) return flagged;
  if (Number(shippingCost) !== 0) return false;
  return flagged || (method !== "PICKUP" && method !== "COURIER");
}

/**
 * Who receives the order, where and how (TASK-217, TASK-647), read from the
 * order's address snapshot by `deliveryMethod` — a Nova Poshta branch, a pickup
 * point or a typed address. Feeds the shared «Доставка» block (confirmation
 * page, guest order page) and the account order detail, so the three agree.
 * The owner sees their own street here; it is the public `/orders/status`
 * projection that must never carry it.
 */
export function orderDeliveryDetails(
  order: Pick<OrderEntity, "deliveryMethod"> & {
    // Wider than the generated type on purpose: the seeded shape is not in it.
    shippingAddress: OrderEntity["shippingAddress"] | AddressSnapshot;
    /** The booked cost; enables the legacy «NP at 0» rule above. */
    shippingCost?: string;
  },
): OrderDeliveryDetails {
  const address = (order.shippingAddress ?? {}) as AddressSnapshot;

  const name = [text(address, "firstName"), text(address, "lastName")]
    .filter(Boolean)
    .join(" ");

  const street =
    [text(address, "address1"), text(address, "address2")]
      .filter(Boolean)
      .join(", ") || null;

  let place: OrderDeliveryDetails["place"] = null;
  let pickup: OrderPickupPointSnapshot | null = null;
  if (order.deliveryMethod === "PICKUP") {
    pickup = {
      name: text(address, "pickupPointName"),
      // Orders before TASK-643 carry the point address in `address1` only.
      address: text(address, "pickupPointAddress") ?? street,
      hours: text(address, "pickupPointHours"),
      phone: text(address, "pickupPointPhone"),
      mapUrl: httpUrl(text(address, "pickupPointMapUrl")),
    };
    const value = [pickup.name, pickup.address].filter(Boolean).join(", ");
    if (value) place = { kind: "pickup", value };
  } else if (order.deliveryMethod === "NOVA_POSHTA") {
    const value =
      text(address, "npWarehouseName") ?? text(address, "warehouse") ?? street;
    if (value) place = { kind: "warehouse", value };
  } else if (street) {
    place = { kind: "address", value: street };
  }

  return {
    method: order.deliveryMethod,
    recipient: name || text(address, "recipient"),
    phone: text(address, "phone"),
    city: text(address, "city"),
    place,
    street,
    pickup,
    shippingCostPending: isShippingCostPending(
      order.deliveryMethod,
      address.shippingCostPending === true,
      order.shippingCost,
    ),
  };
}
