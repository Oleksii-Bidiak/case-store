import {
  addonServiceSchema,
  addonServiceFormValuesToDto,
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
