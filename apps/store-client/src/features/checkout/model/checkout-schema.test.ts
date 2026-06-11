import { checkoutSchema } from "./checkout-schema";

const validAddress = {
  firstName: "Olena",
  lastName: "Shevchenko",
  address1: "vul. Khreshchatyk 1",
  city: "Kyiv",
  postalCode: "01001",
  country: "UA",
};

describe("checkoutSchema", () => {
  it("accepts a full payload with shipping, billing, and notes", () => {
    const result = checkoutSchema.safeParse({
      shippingAddress: validAddress,
      billingSameAsShipping: false,
      billingAddress: { ...validAddress, firstName: "Ivan" },
      notes: "Leave at the door",
    });

    expect(result.success).toBe(true);
  });

  it("accepts a minimal payload (shipping only, billing same as shipping)", () => {
    const result = checkoutSchema.safeParse({
      shippingAddress: validAddress,
      billingSameAsShipping: true,
    });

    expect(result.success).toBe(true);
  });

  it("rejects a missing shippingAddress.firstName", () => {
    const result = checkoutSchema.safeParse({
      shippingAddress: { ...validAddress, firstName: "" },
      billingSameAsShipping: true,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.path.join(".") === "shippingAddress.firstName",
      );
      expect(issue?.message).toBe("First name is required");
    }
  });

  it("rejects a country code that is not exactly 2 characters", () => {
    const result = checkoutSchema.safeParse({
      shippingAddress: { ...validAddress, country: "Ukraine" },
      billingSameAsShipping: true,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.path.join(".") === "shippingAddress.country",
      );
      expect(issue?.message).toBe("Country must be a 2-letter ISO code");
    }
  });

  it("rejects notes longer than 500 characters", () => {
    const result = checkoutSchema.safeParse({
      shippingAddress: validAddress,
      billingSameAsShipping: true,
      notes: "x".repeat(501),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.path.join(".") === "notes",
      );
      expect(issue?.message).toBe("Notes must be 500 characters or fewer");
    }
  });

  it("rejects billingSameAsShipping=false with no billingAddress", () => {
    const result = checkoutSchema.safeParse({
      shippingAddress: validAddress,
      billingSameAsShipping: false,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.path.join(".") === "billingAddress",
      );
      expect(issue?.message).toBe(
        "Billing address is required when it differs from shipping.",
      );
    }
  });

  it("accepts billingSameAsShipping=false with a valid billingAddress", () => {
    const result = checkoutSchema.safeParse({
      shippingAddress: validAddress,
      billingSameAsShipping: false,
      billingAddress: validAddress,
    });

    expect(result.success).toBe(true);
  });

  it("accepts a payload with all optional address fields absent", () => {
    const result = checkoutSchema.safeParse({
      shippingAddress: {
        firstName: "Olena",
        lastName: "Shevchenko",
        address1: "vul. Khreshchatyk 1",
        city: "Kyiv",
        postalCode: "01001",
        country: "UA",
      },
      billingSameAsShipping: true,
    });

    expect(result.success).toBe(true);
  });
});
