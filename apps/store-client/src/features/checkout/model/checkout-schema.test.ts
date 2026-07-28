import { checkoutSchema, guestCheckoutSchema } from "./checkout-schema";
import { dict } from "@/shared/config";

const validForm = {
  firstName: "Olena",
  lastName: "Shevchenko",
  phone: "+380501234567",
  city: "Kyiv",
  deliveryAddress: "Нова Пошта, відділення №12",
  // Required since TASK-330-B. The form always supplies it (it is a default
  // value, not something the shopper has to touch), so a payload without one is
  // a bug rather than a case to tolerate.
  paymentMethod: "ON_DELIVERY" as const,
};

describe("checkoutSchema (UA)", () => {
  it("accepts a valid payload (with optional notes)", () => {
    const result = checkoutSchema.safeParse({
      ...validForm,
      notes: "Подзвоніть перед доставкою",
    });

    expect(result.success).toBe(true);
  });

  it("accepts a minimal payload (no notes)", () => {
    expect(checkoutSchema.safeParse(validForm).success).toBe(true);
  });

  it("rejects a missing firstName", () => {
    const result = checkoutSchema.safeParse({ ...validForm, firstName: "" });

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.path.join(".") === "firstName",
      );
      expect(issue?.message).toBe(dict.checkout.validation.firstName);
    }
  });

  it("rejects a missing deliveryAddress", () => {
    const result = checkoutSchema.safeParse({
      ...validForm,
      deliveryAddress: "",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.path.join(".") === "deliveryAddress",
      );
      expect(issue?.message).toBe(dict.checkout.validation.deliveryAddress);
    }
  });

  it("rejects an invalid phone number", () => {
    const result = checkoutSchema.safeParse({ ...validForm, phone: "123" });

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.path.join(".") === "phone",
      );
      expect(issue?.message).toBe(dict.checkout.validation.phone);
    }
  });

  it("accepts a local-format UA phone number", () => {
    expect(
      checkoutSchema.safeParse({ ...validForm, phone: "0501234567" }).success,
    ).toBe(true);
  });

  it("rejects notes longer than 500 characters", () => {
    const result = checkoutSchema.safeParse({
      ...validForm,
      notes: "x".repeat(501),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.path.join(".") === "notes",
      );
      expect(issue?.message).toBe(dict.checkout.validation.notesMax);
    }
  });

  it("rejects a payment method the storefront cannot carry out", () => {
    expect(
      checkoutSchema.safeParse({ ...validForm, paymentMethod: "BITCOIN" })
        .success,
    ).toBe(false);
  });
});

/**
 * TASK-338. A guest supplies one field an account holder does not — the email
 * that carries their confirmation letter and, with it, the tokenised link that
 * is their only way back to the order.
 */
describe("guestCheckoutSchema", () => {
  const emailIssue = (value: unknown) => {
    const result = guestCheckoutSchema.safeParse({
      ...validForm,
      email: value,
    });
    if (result.success) return null;
    return result.error.issues.find((i) => i.path.join(".") === "email");
  };

  it("accepts a valid contact email", () => {
    expect(
      guestCheckoutSchema.safeParse({
        ...validForm,
        email: "olena@example.com",
      }).success,
    ).toBe(true);
  });

  it("requires an email", () => {
    expect(emailIssue(undefined)?.message).toBe(
      dict.checkout.guest.validationEmailRequired,
    );
    expect(emailIssue("   ")?.message).toBe(
      dict.checkout.guest.validationEmailRequired,
    );
  });

  it("rejects a malformed email", () => {
    expect(emailIssue("not-an-email")?.message).toBe(
      dict.checkout.guest.validationEmail,
    );
  });

  it("leaves the email optional for an account holder", () => {
    // Same field, different schema: the backend ignores a contact block from an
    // authenticated caller, so demanding it of them would be pointless friction.
    expect(checkoutSchema.safeParse(validForm).success).toBe(true);
  });
});
