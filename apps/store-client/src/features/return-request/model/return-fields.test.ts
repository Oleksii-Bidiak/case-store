import { dict } from "@/shared/config";
import { placeReturnFieldErrors } from "./return-fields";

/** An Axios-shaped failure carrying the API's 400 body. */
function badRequest(fieldErrors: Array<{ field: string; constraint: string }>) {
  return {
    isAxiosError: true,
    response: {
      status: 400,
      data: { statusCode: 400, message: ["refused"], fieldErrors },
    },
  };
}

/** TASK-1984 (forms Rule 6b): `CreateReturnDto` paths → dialog fields. */
describe("placeReturnFieldErrors", () => {
  it("names the reason limit on a maxLength", () => {
    expect(
      placeReturnFieldErrors(
        badRequest([{ field: "reason", constraint: "maxLength" }]),
      ),
    ).toEqual({
      errors: { reason: dict.returnRequest.reasonMax },
      complete: true,
    });
  });

  it("puts every line error on the one line list", () => {
    const placed = placeReturnFieldErrors(
      badRequest([
        { field: "items.0.quantity", constraint: "min" },
        { field: "items.1.orderItemId", constraint: "isUuid" },
      ]),
    );
    expect(placed).toEqual({
      errors: { items: dict.returnRequest.itemsInvalid },
      complete: true,
    });
  });

  it("is incomplete when part of the 400 finds no field", () => {
    const placed = placeReturnFieldErrors(
      badRequest([
        { field: "reason", constraint: "isString" },
        { field: "extra", constraint: "whitelistValidation" },
      ]),
    );
    expect(placed.errors).toEqual({ reason: dict.forms.invalid });
    expect(placed.complete).toBe(false);
  });

  it("places nothing for a coded refusal without fieldErrors", () => {
    expect(
      placeReturnFieldErrors({
        isAxiosError: true,
        response: { status: 400, data: { error: "RETURN_QUANTITY_EXCEEDED" } },
      }),
    ).toEqual({ errors: {}, complete: false });
  });
});
