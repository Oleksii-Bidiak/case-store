import type { ServerFieldMap } from "@/shared/lib/form-errors";
import type { CheckoutFormValues } from "./checkout-schema";
import type { CheckoutDeliveryOptions } from "./delivery";

/**
 * Where a `POST /api/orders` 400 lands on the checkout form (TASK-1984, forms
 * convention Rule 6b): `CreateOrderDto` path → step-1 field.
 *
 * The recipient and the guest's contact share fields — `useCheckout` sends the
 * same name and phone in both blocks — so `contact.phone` lands on the one phone
 * input and `contact.name` («first last», `@MaxLength(120)`) under the last name.
 *
 * `shippingAddress.city` / `address1` depend on the branch the payload was built
 * from (`toDeliveryPayload`): the typed city and address, the courier's typed
 * city and street, or — for a pickup point, whose city and address are the
 * shop's own — nothing the shopper could fix, so they stay unmapped and become
 * the banner.
 */
export function checkoutServerFieldMap(
  values: Pick<CheckoutFormValues, "deliveryMethod">,
  options: {
    courier: Pick<CheckoutDeliveryOptions["courier"], "cityName">;
  },
): ServerFieldMap {
  const map: ServerFieldMap = {
    "shippingAddress.firstName": "firstName",
    "shippingAddress.lastName": "lastName",
    "shippingAddress.phone": "phone",
    "contact.email": "email",
    "contact.phone": "phone",
    "contact.name": "lastName",
    notes: "notes",
  };

  switch (values.deliveryMethod) {
    case "PICKUP":
      return map;
    case "COURIER":
      if (!options.courier.cityName?.trim()) {
        map["shippingAddress.city"] = "courierCity";
      }
      map["shippingAddress.address1"] = "courierStreet";
      return map;
    case "OTHER":
    case "NOVA_POSHTA":
    default:
      map["shippingAddress.city"] = "city";
      map["shippingAddress.address1"] = "deliveryAddress";
      return map;
  }
}
