import { z } from "zod";
import type { AddressDto, OrderEntity } from "@/entities/order";
import { dict } from "@/shared/config";

const required = dict.orderCreate.addressRequired;

/**
 * The delivery address, as an operator may correct it before the parcel ships
 * (TASK-341).
 *
 * The required set mirrors the backend `AddressDto`: the five fields a courier
 * cannot deliver without. Optional extras that already exist on the order are
 * carried through untouched by {@link addressValuesToDto} — a correction to the
 * city must not silently drop the Nova Poshta warehouse reference alongside it.
 */
export const orderAddressSchema = z.object({
  firstName: z.string().trim().min(1, required),
  lastName: z.string().trim().min(1, required),
  phone: z.string().trim().min(1, required),
  city: z.string().trim().min(1, required),
  address1: z.string().trim().min(1, required),
  postalCode: z.string().trim(),
});

export type OrderAddressFormValues = z.infer<typeof orderAddressSchema>;

/** Read one string field off the order's untyped address snapshot. */
function field(
  address: Record<string, unknown> | null | undefined,
  key: string,
): string {
  const value = address?.[key];
  return typeof value === "string" ? value : "";
}

/** Seed the form from the order's current shipping address. */
export function mapOrderToAddressValues(
  order: Pick<OrderEntity, "shippingAddress">,
): OrderAddressFormValues {
  const address = order.shippingAddress as Record<string, unknown> | null;

  return {
    firstName: field(address, "firstName"),
    lastName: field(address, "lastName"),
    phone: field(address, "phone"),
    city: field(address, "city"),
    address1: field(address, "address1"),
    postalCode: field(address, "postalCode"),
  };
}

/**
 * Build the replacement address, preserving everything the form does not edit.
 *
 * The write REPLACES the whole address object, so fields absent from this form —
 * `company`, `address2`, `state`, `country` and the three Nova Poshta refs —
 * are copied across from the existing snapshot. Without that, fixing a typo in
 * the recipient's name would quietly delete the warehouse reference the courier
 * integration depends on.
 */
export function addressValuesToDto(
  values: OrderAddressFormValues,
  current: Record<string, unknown> | null | undefined,
): AddressDto {
  const carryOver = (key: string) => {
    const value = current?.[key];
    return typeof value === "string" && value !== "" ? { [key]: value } : {};
  };

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
    ...carryOver("npCityRef"),
    ...carryOver("npWarehouseName"),
    ...carryOver("npWarehouseRef"),
  };
}
