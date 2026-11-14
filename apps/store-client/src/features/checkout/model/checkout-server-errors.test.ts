import { dict } from "@/shared/config";
import { mapServerFieldErrors } from "@/shared/lib/form-errors";
import { checkoutServerFieldMap } from "./checkout-server-errors";

/** A `POST /api/orders` 400 as the API's ValidationPipe sends it. */
const refusal = (...fieldErrors: { field: string; constraint: string }[]) => ({
  response: {
    status: 400,
    data: { statusCode: 400, message: "Bad Request", fieldErrors },
  },
});

const courierNamed = { courier: { cityName: "Київ" } };
const courierUnnamed = { courier: { cityName: null } };

describe("checkoutServerFieldMap (TASK-1984)", () => {
  it("puts the guest's contact block on the step-1 fields it was built from", () => {
    const errors = mapServerFieldErrors(
      refusal(
        { field: "contact.email", constraint: "isEmail" },
        { field: "contact.phone", constraint: "isInternationalPhone" },
        { field: "contact.name", constraint: "maxLength" },
      ),
      checkoutServerFieldMap({ deliveryMethod: "NOVA_POSHTA" }, courierNamed),
    );
    expect(errors).toEqual({
      email: dict.forms.emailInvalid,
      phone: dict.forms.phoneInvalid,
      lastName: dict.forms.tooLong,
    });
  });

  it("maps the address by branch: typed city and address for Nova Poshta / other", () => {
    for (const deliveryMethod of ["NOVA_POSHTA", "OTHER"] as const) {
      expect(
        mapServerFieldErrors(
          refusal(
            { field: "shippingAddress.city", constraint: "maxLength" },
            { field: "shippingAddress.address1", constraint: "maxLength" },
          ),
          checkoutServerFieldMap({ deliveryMethod }, courierNamed),
        ),
      ).toEqual({
        city: dict.forms.tooLong,
        deliveryAddress: dict.forms.tooLong,
      });
    }
  });

  it("maps the courier's address1 to the street, and its city only when typed", () => {
    const error = refusal(
      { field: "shippingAddress.city", constraint: "maxLength" },
      { field: "shippingAddress.address1", constraint: "maxLength" },
    );
    expect(
      mapServerFieldErrors(
        error,
        checkoutServerFieldMap({ deliveryMethod: "COURIER" }, courierNamed),
      ),
    ).toEqual({ courierStreet: dict.forms.tooLong });
    expect(
      mapServerFieldErrors(
        error,
        checkoutServerFieldMap({ deliveryMethod: "COURIER" }, courierUnnamed),
      ),
    ).toEqual({
      courierCity: dict.forms.tooLong,
      courierStreet: dict.forms.tooLong,
    });
  });

  it("leaves a pickup point's address unmapped — the shopper did not type it", () => {
    expect(
      mapServerFieldErrors(
        refusal({ field: "shippingAddress.address1", constraint: "maxLength" }),
        checkoutServerFieldMap({ deliveryMethod: "PICKUP" }, courierNamed),
      ),
    ).toEqual({});
  });
});
