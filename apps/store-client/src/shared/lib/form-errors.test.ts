import { dict } from "@/shared/config";
import {
  applyServerFieldErrors,
  mapServerFieldErrors,
  readFieldErrors,
} from "./form-errors";

/**
 * TASK-1984 (forms convention, Rule 6b): a server 400 lands on the field it is
 * about. The API's global ValidationPipe answers with
 * `fieldErrors: [{ field, constraint }]` next to `message`; these helpers turn
 * that into localized errors under the form's own fields.
 */
function axiosError(data: unknown, status = 400) {
  return { isAxiosError: true, response: { status, data } };
}

const ORDER_400 = axiosError({
  statusCode: 400,
  error: "Bad Request",
  message: "shippingAddress.phone must be …; email must be an email",
  fieldErrors: [
    { field: "shippingAddress.phone", constraint: "isInternationalPhone" },
    { field: "email", constraint: "isEmail" },
    { field: "shippingAddress.city", constraint: "maxLength" },
    { field: "items.0.quantity", constraint: "min" },
  ],
});

describe("readFieldErrors", () => {
  it("reads fieldErrors from the axios error body", () => {
    expect(readFieldErrors(ORDER_400)).toHaveLength(4);
    expect(readFieldErrors(ORDER_400)[0]).toEqual({
      field: "shippingAddress.phone",
      constraint: "isInternationalPhone",
    });
  });

  it.each([
    ["no response", new Error("Network Error")],
    ["no fieldErrors key", axiosError({ statusCode: 400, message: "x" })],
    ["a non-array value", axiosError({ fieldErrors: "email" })],
    ["undefined", undefined],
  ])("returns [] for %s", (_label, error) => {
    expect(readFieldErrors(error)).toEqual([]);
  });

  it("skips malformed entries", () => {
    const error = axiosError({
      fieldErrors: [
        { field: "email", constraint: "isEmail" },
        { field: 1, constraint: "isEmail" },
        null,
        { field: "name" },
      ],
    });

    expect(readFieldErrors(error)).toEqual([
      { field: "email", constraint: "isEmail" },
    ]);
  });
});

describe("mapServerFieldErrors", () => {
  it("maps exact DTO paths to form fields with a message by constraint", () => {
    expect(
      mapServerFieldErrors(ORDER_400, {
        "shippingAddress.phone": "phone",
        email: "email",
        "shippingAddress.city": "city",
      }),
    ).toEqual({
      phone: dict.forms.phoneInvalid,
      email: dict.forms.emailInvalid,
      city: dict.forms.tooLong,
    });
  });

  it("supports a prefix form: `a.*` → field, or `a.*` → `b.*` keeping the rest", () => {
    expect(
      mapServerFieldErrors(ORDER_400, {
        "shippingAddress.*": "address.*",
        "items.*": "items",
      }),
    ).toEqual({
      "address.phone": dict.forms.phoneInvalid,
      "address.city": dict.forms.tooLong,
      items: dict.forms.invalid,
    });
  });

  it("prefers an exact path over a prefix", () => {
    expect(
      mapServerFieldErrors(ORDER_400, {
        "shippingAddress.*": "address",
        "shippingAddress.phone": "phone",
      }),
    ).toEqual({ phone: dict.forms.phoneInvalid, address: dict.forms.tooLong });
  });

  it.each([
    ["isUaPhone", dict.forms.phoneInvalid],
    ["isInternationalPhone", dict.forms.phoneInvalid],
    ["isEmail", dict.forms.emailInvalid],
    ["maxLength", dict.forms.tooLong],
    ["isNotEmpty", dict.forms.required],
    ["minLength", dict.forms.required],
    ["whitelistValidation", dict.forms.invalid],
    ["isUuid", dict.forms.invalid],
  ])("localizes constraint %p", (constraint, message) => {
    const error = axiosError({ fieldErrors: [{ field: "x", constraint }] });
    expect(mapServerFieldErrors(error, { x: "x" })).toEqual({ x: message });
  });

  it("lets `messages` override the text per form field", () => {
    expect(
      mapServerFieldErrors(
        ORDER_400,
        { email: "email" },
        { email: "Ця пошта не підходить" },
      ),
    ).toEqual({ email: "Ця пошта не підходить" });
  });

  it("keeps the first error when several land on one form field", () => {
    const error = axiosError({
      fieldErrors: [
        { field: "phone", constraint: "isUaPhone" },
        { field: "phone", constraint: "maxLength" },
      ],
    });
    expect(mapServerFieldErrors(error, { phone: "phone" })).toEqual({
      phone: dict.forms.phoneInvalid,
    });
  });

  it("returns {} for an error without fieldErrors", () => {
    expect(mapServerFieldErrors(new Error("boom"), { email: "email" })).toEqual(
      {},
    );
  });
});

describe("applyServerFieldErrors", () => {
  it("sets a 'server' error on each mapped field and reports what it could not map", () => {
    const setError = jest.fn();

    const result = applyServerFieldErrors(ORDER_400, setError, {
      "shippingAddress.phone": "phone",
      email: "email",
    });

    expect(setError).toHaveBeenCalledTimes(2);
    expect(setError).toHaveBeenCalledWith("phone", {
      type: "server",
      message: dict.forms.phoneInvalid,
    });
    expect(setError).toHaveBeenCalledWith("email", {
      type: "server",
      message: dict.forms.emailInvalid,
    });
    expect(result.mapped).toEqual(["phone", "email"]);
    expect(result.unmapped).toEqual([
      { field: "shippingAddress.city", constraint: "maxLength" },
      { field: "items.0.quantity", constraint: "min" },
    ]);
  });

  it("does not ask RHF to focus — the caller decides", () => {
    const setError = jest.fn();
    applyServerFieldErrors(ORDER_400, setError, { email: "email" });

    expect(setError.mock.calls[0]).toHaveLength(2);
  });

  it("maps nothing and reports nothing for an error without fieldErrors", () => {
    const setError = jest.fn();

    expect(
      applyServerFieldErrors(axiosError({ message: "x" }, 409), setError, {
        email: "email",
      }),
    ).toEqual({ mapped: [], unmapped: [] });
    expect(setError).not.toHaveBeenCalled();
  });
});
