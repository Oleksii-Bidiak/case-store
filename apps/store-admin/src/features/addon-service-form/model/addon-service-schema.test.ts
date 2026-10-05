import {
  ADDON_DESCRIPTION_MAX,
  addonServiceSchema,
  addonServiceSchemaFor,
  addonServiceFormValuesToDto,
  mapAddonServiceToFormValues,
  type AddonServiceFormInput,
} from "./addon-service-schema";

const baseInput: AddonServiceFormInput = {
  name: "Гарантійний сертифікат",
  description: "",
  price: "499",
  isActive: true,
};

describe("addonServiceSchema (TASK-174)", () => {
  it("accepts a name + price service with no description", () => {
    expect(addonServiceSchema.safeParse(baseInput).success).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(
      addonServiceSchema.safeParse({ ...baseInput, name: "" }).success,
    ).toBe(false);
  });

  it("accepts a FREE service — an add-on may legitimately cost 0", () => {
    expect(
      addonServiceSchema.safeParse({ ...baseInput, price: "0" }).success,
    ).toBe(true);
  });

  it("rejects a negative price and a non-numeric price", () => {
    expect(
      addonServiceSchema.safeParse({ ...baseInput, price: "-1" }).success,
    ).toBe(false);
    expect(
      addonServiceSchema.safeParse({ ...baseInput, price: "дорого" }).success,
    ).toBe(false);
  });

  // AddonServicesProposal ДП4 — the description is one line next to a cart
  // checkbox; the counter and the limit are 300 (TASK-1083).
  it("caps the description at 300 characters", () => {
    expect(ADDON_DESCRIPTION_MAX).toBe(300);
    expect(
      addonServiceSchema.safeParse({
        ...baseInput,
        description: "а".repeat(300),
      }).success,
    ).toBe(true);
    expect(
      addonServiceSchema.safeParse({
        ...baseInput,
        description: "а".repeat(301),
      }).success,
    ).toBe(false);
  });

  // The API took 2000 before the limit: an unchanged older description must
  // not block saving a new price.
  it("lets a longer description saved earlier through unchanged, but not edited", () => {
    const saved = "б".repeat(450);
    const schema = addonServiceSchemaFor(saved);
    expect(schema.safeParse({ ...baseInput, description: saved }).success).toBe(
      true,
    );
    expect(
      schema.safeParse({ ...baseInput, description: `${saved}!` }).success,
    ).toBe(false);
  });

  it("rejects a blank price", () => {
    expect(
      addonServiceSchema.safeParse({ ...baseInput, price: "" }).success,
    ).toBe(false);
  });
});

describe("addonServiceFormValuesToDto", () => {
  it("coerces the price to a number and drops a blank description", () => {
    const values = addonServiceSchema.parse(baseInput);

    expect(addonServiceFormValuesToDto(values)).toEqual({
      name: "Гарантійний сертифікат",
      description: undefined,
      price: 499,
      isActive: true,
    });
  });

  it("keeps a filled-in description", () => {
    const values = addonServiceSchema.parse({
      ...baseInput,
      description: "  24 місяці  ",
    });

    expect(addonServiceFormValuesToDto(values).description).toBe("24 місяці");
  });
});

describe("mapAddonServiceToFormValues (wave 198)", () => {
  const entity = {
    id: "s1",
    name: "Гарантія",
    description: null,
    price: "499.00",
    isActive: false,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  };

  it("drops the API's trailing «.00» so the field reads «499», not «499.00»", () => {
    expect(mapAddonServiceToFormValues(entity)).toEqual({
      name: "Гарантія",
      description: "",
      price: "499",
      isActive: false,
    });
  });

  it("keeps kopiyky", () => {
    expect(
      mapAddonServiceToFormValues({ ...entity, price: "29.90" }).price,
    ).toBe("29.9");
  });
});
