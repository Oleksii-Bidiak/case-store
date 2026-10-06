import {
  CHECKOUT_DEFAULT_VALUES,
  checkoutSchema,
  guestCheckoutSchema,
} from "./checkout-schema";
import { dict } from "@/shared/config";

const validForm = {
  firstName: "Olena",
  lastName: "Shevchenko",
  phone: "+380501234567",
  deliveryMethod: "NOVA_POSHTA" as const,
  city: "Kyiv",
  // A Nova Poshta city picked from the directory (TASK-646: a typed one is not
  // enough — the server refuses an NP order without the ref).
  npCityRef: "city-ref-1",
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

  // TASK-407: the rule reads the NUMBER, not the mask around it. The old
  // `/^\+?[\d\s()-]{10,20}$/` counted characters, so every case below passed.
  describe("phone — validated on the normalised value, not the mask", () => {
    it.each([
      ["+380 50 123 4567", "the exact string PhoneInput renders"],
      ["+38 (050) 123-45-67", "brackets and dashes"],
      ["80501234567", "the old inter-city prefix"],
      ["501234567", "the bare local part"],
    ])("accepts %s (%s)", (phone) => {
      expect(checkoutSchema.safeParse({ ...validForm, phone }).success).toBe(
        true,
      );
    });

    it.each([
      ["+380 50 123", "a half-typed number — 11 mask characters, 8 digits"],
      ["(((((((((((", "punctuation only"],
      ["05012345678", "one digit too many"],
      ["+1 234 567 8901", "a foreign number"],
      ["", "empty — and it must say so in Ukrainian"],
    ])("rejects %s (%s)", (phone) => {
      const result = checkoutSchema.safeParse({ ...validForm, phone });

      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find(
          (i) => i.path.join(".") === "phone",
        );
        expect(issue?.message).toBe(dict.checkout.validation.phone);
      }
    });
  });

  // Without this key an untouched phone field reported zod's English "Required"
  // — the one sentence on the screen a Ukrainian shopper could not read.
  it("defaults the phone to an empty string so the message stays Ukrainian", () => {
    expect(CHECKOUT_DEFAULT_VALUES.phone).toBe("");
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

/**
 * TASK-646 — one schema, four delivery branches. Each branch requires its own
 * fields and ignores the others', so a shopper who switched from Nova Poshta to
 * pickup is not held back by an empty field they can no longer see.
 */
describe("checkoutSchema — delivery branches (TASK-646)", () => {
  const base = {
    firstName: "Olena",
    lastName: "Shevchenko",
    phone: "+380501234567",
    paymentMethod: "ON_DELIVERY" as const,
    city: "",
    deliveryAddress: "",
  };

  const issuesOf = (values: Record<string, unknown>) => {
    const result = checkoutSchema.safeParse(values);
    if (result.success) return {};
    return Object.fromEntries(
      result.error.issues.map((issue) => [issue.path.join("."), issue.message]),
    );
  };

  const d = dict.checkout.delivery.validation;

  describe("Nova Poshta", () => {
    it("requires a city and a branch", () => {
      expect(issuesOf({ ...base, deliveryMethod: "NOVA_POSHTA" })).toEqual({
        city: dict.checkout.validation.city,
        deliveryAddress: dict.checkout.validation.deliveryAddress,
      });
    });

    it("refuses a typed city that was never picked from the directory", () => {
      expect(
        issuesOf({
          ...base,
          deliveryMethod: "NOVA_POSHTA",
          city: "Київ",
          npCityRef: "",
          deliveryAddress: "Відділення №1",
        }),
      ).toEqual({ city: d.npCity });
    });

    it("accepts a typed city on the manual path, when the directory is down (TASK-1097)", () => {
      expect(
        checkoutSchema.safeParse({
          ...base,
          deliveryMethod: "NOVA_POSHTA",
          npManual: true,
          city: "Ромни",
          deliveryAddress: "вул. Соборна, 5",
        }).success,
      ).toBe(true);
    });

    it("still requires the city and address on the manual path", () => {
      expect(
        issuesOf({ ...base, deliveryMethod: "NOVA_POSHTA", npManual: true }),
      ).toEqual({
        city: dict.checkout.validation.city,
        deliveryAddress: dict.checkout.validation.deliveryAddress,
      });
    });
  });

  it("pickup requires a pickup point — and nothing of the address", () => {
    expect(
      issuesOf({ ...base, deliveryMethod: "PICKUP", pickupPointId: "" }),
    ).toEqual({ pickupPointId: d.pickupPoint });
    expect(
      checkoutSchema.safeParse({
        ...base,
        deliveryMethod: "PICKUP",
        pickupPointId: "pp-1",
      }).success,
    ).toBe(true);
  });

  it("courier requires street and house; the flat is optional", () => {
    expect(
      issuesOf({
        ...base,
        deliveryMethod: "COURIER",
        courierStreet: " ",
        courierHouse: "",
      }),
    ).toEqual({ courierStreet: d.courierStreet, courierHouse: d.courierHouse });
    expect(
      checkoutSchema.safeParse({
        ...base,
        deliveryMethod: "COURIER",
        courierStreet: "вул. Велика Васильківська",
        courierHouse: "10",
        courierApartment: "",
      }).success,
    ).toBe(true);
  });

  it("courier reports missing fields in Ukrainian even when the keys are absent", () => {
    expect(issuesOf({ ...base, deliveryMethod: "COURIER" })).toEqual({
      courierStreet: d.courierStreet,
      courierHouse: d.courierHouse,
    });
  });

  it("other requires a city and a free-text address, with no directory ref", () => {
    expect(issuesOf({ ...base, deliveryMethod: "OTHER" })).toEqual({
      city: dict.checkout.validation.city,
      deliveryAddress: d.otherAddress,
    });
    expect(
      checkoutSchema.safeParse({
        ...base,
        deliveryMethod: "OTHER",
        city: "Ужгород",
        deliveryAddress: "Укрпошта, індекс 88000",
      }).success,
    ).toBe(true);
  });

  it("reports the delivery fields together with the recipient's on one submit", () => {
    // Zod runs a refinement only once the object itself parsed — with every
    // field defaulted it does, so «Далі» lists every problem at once.
    const issues = issuesOf({
      ...CHECKOUT_DEFAULT_VALUES,
      deliveryMethod: "PICKUP",
    });
    expect(issues.firstName).toBe(dict.checkout.validation.firstName);
    expect(issues.pickupPointId).toBe(d.pickupPoint);
  });

  it("rejects a delivery method the storefront does not know", () => {
    expect(
      checkoutSchema.safeParse({ ...base, deliveryMethod: "DRONE" }).success,
    ).toBe(false);
  });

  it("defaults every delivery field (forms.md Rule 4c)", () => {
    expect(CHECKOUT_DEFAULT_VALUES).toMatchObject({
      deliveryMethod: "NOVA_POSHTA",
      npManual: false,
      pickupPointId: "",
      courierStreet: "",
      courierHouse: "",
      courierApartment: "",
    });
  });
});
