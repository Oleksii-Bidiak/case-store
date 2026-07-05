import {
  brandSchema,
  brandFormValuesToDto,
  type BrandFormInput,
  type BrandFormValues,
} from "./brand-schema";

const baseInput: BrandFormInput = {
  name: "Spigen",
  slug: "",
  logo: "",
  isActive: true,
};

const baseValues: BrandFormValues = {
  name: "Spigen",
  slug: "",
  logo: "",
  isActive: true,
};

describe("brandSchema", () => {
  it("accepts a name-only brand (slug/logo blank)", () => {
    const result = brandSchema.safeParse(baseInput);
    expect(result.success).toBe(true);
  });

  it("rejects an empty name", () => {
    const result = brandSchema.safeParse({ ...baseInput, name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a slug with invalid characters", () => {
    const result = brandSchema.safeParse({ ...baseInput, slug: "Spigen UA" });
    expect(result.success).toBe(false);
  });

  it("accepts a valid lowercase-hyphen slug", () => {
    const result = brandSchema.safeParse({ ...baseInput, slug: "spigen-ua" });
    expect(result.success).toBe(true);
  });

  it("rejects a non-URL logo", () => {
    const result = brandSchema.safeParse({ ...baseInput, logo: "not-a-url" });
    expect(result.success).toBe(false);
  });
});

describe("brandFormValuesToDto", () => {
  it("drops blank optional strings so the backend treats them as omitted", () => {
    const dto = brandFormValuesToDto(baseValues);
    expect(dto).toEqual({
      name: "Spigen",
      slug: undefined,
      logo: undefined,
      isActive: true,
    });
  });

  it("passes through a provided slug and logo", () => {
    const dto = brandFormValuesToDto({
      ...baseValues,
      slug: "spigen",
      logo: "https://example.com/logo.svg",
    });
    expect(dto.slug).toBe("spigen");
    expect(dto.logo).toBe("https://example.com/logo.svg");
  });
});
