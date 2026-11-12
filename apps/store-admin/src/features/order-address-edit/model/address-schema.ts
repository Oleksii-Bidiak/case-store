import { z } from "zod";
import {
  isShippingCostPending,
  orderDeliveryMethod,
  type AddressDto,
  type OrderEntity,
  type UpdateOrderDetailsDto,
} from "@/entities/order";
import { ADDRESS_LIMITS } from "@/entities/delivery";
import { dict } from "@/shared/config";
// `AddressDto.phone` is `@IsInternationalPhone` (TASK-338) — the rule named the
// same here (forms convention Rule 5a), never the UA one.
import { phoneField } from "@/shared/lib/phone-field";
import type { ServerFieldMap } from "@/shared/lib/form-errors";
import { parseMoneyInput } from "@/shared/lib/money-input";

const required = dict.orderCreate.addressRequired;
const tooLong = dict.forms.tooLong;

/**
 * `UpdateOrderDetailsDto` path → the field of this edit (Rule 6b), for
 * `applyServerFieldErrors`. A pickup order's city and address are the point's,
 * so their refusal lands on the point; an NP ref's on the name it belongs to.
 */
export function addressFieldMap(method: string): ServerFieldMap {
  const atPoint = method === "PICKUP";
  const city = atPoint ? "pickupPointId" : "city";
  const address1 = atPoint ? "pickupPointId" : "address1";
  return {
    "shippingAddress.firstName": "firstName",
    "shippingAddress.lastName": "lastName",
    "shippingAddress.phone": "phone",
    "shippingAddress.city": city,
    "shippingAddress.npCityRef": city,
    "shippingAddress.address1": address1,
    "shippingAddress.npWarehouseRef": address1,
    "shippingAddress.npWarehouseName": address1,
    "shippingAddress.postalCode": "postalCode",
    pickupPointId: "pickupPointId",
    shippingCost: "shippingCost",
  };
}

const DELIVERY_METHODS = ["NOVA_POSHTA", "PICKUP", "COURIER", "OTHER"] as const;
type DeliveryMethodValue = (typeof DELIVERY_METHODS)[number];

/**
 * The delivery of an order, as an operator may correct it before the parcel
 * ships (TASK-341; the method, the point and the agreed cost since TASK-1973).
 *
 * The address set mirrors the backend `AddressDto`: the fields a courier cannot
 * deliver without — except on a PICKUP order, which is collected at the point
 * and asks for the point instead (TASK-1806). Optional extras that already exist
 * on the order are carried through untouched by {@link addressValuesToDto}.
 *
 * The phone is held to the SAME rule as the API (TASK-577): `AddressDto.phone` is
 * `@IsInternationalPhone`, mirrored here by `isValidInternationalPhone` — the
 * rule the order-create form already uses. It was `min(1)`, so `123` passed the
 * form and came back as a 400 the operator could not place.
 *
 * Every value is a string, so the stale-draft review (TASK-1972) compares and
 * offers each of them — the method and the point included.
 */
export const orderAddressSchema = z
  .object({
    firstName: z
      .string()
      .trim()
      .min(1, required)
      .max(ADDRESS_LIMITS.name, tooLong),
    lastName: z
      .string()
      .trim()
      .min(1, required)
      .max(ADDRESS_LIMITS.name, tooLong),
    phone: z
      .string()
      .trim()
      .min(1, required)
      .max(ADDRESS_LIMITS.phone, tooLong)
      .pipe(
        phoneField({
          rule: "international",
          message: dict.orderCreate.contactPhoneInvalid,
        }),
      ),
    city: z.string().trim().max(ADDRESS_LIMITS.city, tooLong),
    address1: z.string().trim().max(ADDRESS_LIMITS.address1, tooLong),
    postalCode: z.string().trim().max(ADDRESS_LIMITS.postalCode, tooLong),
    deliveryMethod: z.string(),
    pickupPointId: z.string().trim(),
    shippingCost: z.string().trim(),
    // TASK-1973 (verifier): the NP refs are form values, set and cleared by
    // the directory pickers together with the names they belong to.
    npCityRef: z.string().trim(),
    npWarehouseRef: z.string().trim(),
  })
  .superRefine((values, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

    if (values.deliveryMethod === "PICKUP") {
      if (values.pickupPointId === "") {
        issue("pickupPointId", dict.orderCreate.deliveryPickupRequired);
      }
      return;
    }
    if (values.city === "") issue("city", required);
    else if (
      values.deliveryMethod === "NOVA_POSHTA" &&
      values.npCityRef === ""
    ) {
      // A city typed by hand on an NP order: the old ref belonged to the old
      // name, and shipping by it would send the parcel to the old city.
      issue("city", dict.orderCreate.deliveryNpCityRequired);
    }
    if (values.address1 === "") issue("address1", required);
    if (
      values.deliveryMethod === "OTHER" &&
      values.shippingCost !== "" &&
      parseMoneyInput(values.shippingCost) === null
    ) {
      issue("shippingCost", dict.orderCreate.shippingCostInvalid);
    }
  });

export type OrderAddressFormValues = z.infer<typeof orderAddressSchema>;

/** What the delivery edit reads off the order (all but the address optional). */
export type DeliveryEditOrder = Pick<OrderEntity, "shippingAddress"> &
  Partial<
    Pick<OrderEntity, "deliveryMethod" | "pickupPointId" | "shippingCost">
  >;

/** Read one string field off the order's untyped address snapshot. */
function field(
  address: Record<string, unknown> | null | undefined,
  key: string,
): string {
  const value = address?.[key];
  return typeof value === "string" ? value : "";
}

/**
 * Seed the form from the order: its address, its method, its point, and the
 * OTHER cost already agreed (empty while it is still to be agreed).
 */
export function mapOrderToAddressValues(
  order: DeliveryEditOrder,
): OrderAddressFormValues {
  const address = order.shippingAddress as Record<string, unknown> | null;
  const method = orderDeliveryMethod({
    deliveryMethod: order.deliveryMethod as OrderEntity["deliveryMethod"],
    shippingAddress: order.shippingAddress,
  });
  const agreed =
    method === "OTHER" &&
    order.shippingCost !== undefined &&
    !isShippingCostPending({
      deliveryMethod: method,
      shippingAddress: order.shippingAddress,
      shippingCost: order.shippingCost,
    });

  return {
    firstName: field(address, "firstName"),
    lastName: field(address, "lastName"),
    phone: field(address, "phone"),
    city: field(address, "city"),
    address1: field(address, "address1"),
    postalCode: field(address, "postalCode"),
    deliveryMethod: method,
    pickupPointId: order.pickupPointId ?? "",
    shippingCost: agreed ? (order.shippingCost ?? "") : "",
    npCityRef: field(address, "npCityRef"),
    npWarehouseRef: field(address, "npWarehouseRef"),
  };
}

/**
 * Build the replacement address, preserving everything the form does not edit.
 *
 * Fields absent from this form — `company`, `address2`, `state`, `country` —
 * are copied across from the existing snapshot; the Nova Poshta refs are form
 * values (see below).
 * Without that, fixing a typo in the recipient's name would quietly delete the
 * warehouse reference the courier integration depends on. The server rebuilds
 * the delivery part of the snapshot itself (TASK-1020), so the method, the
 * carrier, the point and the «to be quoted» flag are not this function's to
 * carry.
 */
export function addressValuesToDto(
  values: Pick<
    OrderAddressFormValues,
    | "firstName"
    | "lastName"
    | "phone"
    | "city"
    | "address1"
    | "postalCode"
    | "npCityRef"
    | "npWarehouseRef"
  >,
  current: Record<string, unknown> | null | undefined,
  options: { withNpRefs?: boolean } = {},
): AddressDto {
  const carryOver = (key: string) => {
    const value = current?.[key];
    return typeof value === "string" && value !== "" ? { [key]: value } : {};
  };
  const withNpRefs = options.withNpRefs ?? true;

  return {
    firstName: values.firstName,
    lastName: values.lastName,
    phone: values.phone,
    city: values.city,
    address1: values.address1,
    ...(values.postalCode !== "" ? { postalCode: values.postalCode } : {}),
    ...carryOver("company"),
    ...carryOver("address2"),
    ...carryOver("state"),
    ...carryOver("country"),
    // The NP refs come from the FORM, never from the old snapshot (verifier,
    // TASK-1973): the directory pickers set and clear them together with the
    // city and branch names, so a ref can never outlive the name it belongs to.
    // The chosen branch's description IS the address line — it doubles as the
    // NP warehouse name, as on the phone order.
    ...(withNpRefs && values.npCityRef !== ""
      ? { npCityRef: values.npCityRef }
      : {}),
    ...(withNpRefs && values.npWarehouseRef !== ""
      ? {
          npWarehouseRef: values.npWarehouseRef,
          npWarehouseName: values.address1,
        }
      : {}),
  };
}

/**
 * The PATCH body of a delivery edit (TASK-1973): the address always, and the
 * method, the point and the agreed cost only when they CHANGE — a contact edit
 * must not look like a re-pricing to the server (TASK-1020).
 *
 * - The NP refs travel only with a Nova Poshta order.
 * - A PICKUP order's address is the point's: the picked one when the point
 *   changes (`pickupPoint`), else what the snapshot froze.
 */
export function deliveryEditToDto(
  values: OrderAddressFormValues,
  order: DeliveryEditOrder,
  pickupPoint?: { city: string; address: string },
): Pick<
  UpdateOrderDetailsDto,
  "shippingAddress" | "deliveryMethod" | "pickupPointId" | "shippingCost"
> & { shippingAddress: AddressDto } {
  const seeded = mapOrderToAddressValues(order);
  const method = values.deliveryMethod as DeliveryMethodValue;
  const methodChanged = method !== seeded.deliveryMethod;
  const pickup = method === "PICKUP";
  const pointChanged = pickup && values.pickupPointId !== seeded.pickupPointId;
  const cost = method === "OTHER" ? parseMoneyInput(values.shippingCost) : null;
  const costChanged =
    cost !== null && values.shippingCost !== seeded.shippingCost;

  const address = addressValuesToDto(
    pickup && pickupPoint && (pointChanged || methodChanged)
      ? { ...values, city: pickupPoint.city, address1: pickupPoint.address }
      : pickup
        ? { ...values, city: seeded.city, address1: seeded.address1 }
        : values,
    order.shippingAddress as Record<string, unknown> | null,
    { withNpRefs: method === "NOVA_POSHTA" },
  );

  return {
    shippingAddress: address,
    ...(methodChanged ? { deliveryMethod: method } : {}),
    ...(pickup && (pointChanged || methodChanged)
      ? { pickupPointId: values.pickupPointId }
      : {}),
    ...(cost !== null && (costChanged || methodChanged)
      ? { shippingCost: cost }
      : {}),
  };
}

export { DELIVERY_METHODS };
