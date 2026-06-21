import { checkoutSchema } from "./checkout-schema";
import { dict } from "@/shared/config";

const validForm = {
  firstName: "Olena",
  lastName: "Shevchenko",
  phone: "+380501234567",
  city: "Kyiv",
  deliveryAddress: "Нова Пошта, відділення №12",
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
});
