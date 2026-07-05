import {
  bannerSchema,
  bannerFormValuesToCreateDto,
  bannerFormValuesToUpdateDto,
  type BannerFormInput,
  type BannerFormValues,
} from "./banner-schema";

// Output-shaped values (post-parse) — used by the DTO mappers, which consume
// `BannerFormValues` (sortOrder already a number).
const baseValues: BannerFormValues = {
  placement: "HERO_SLIDE",
  title: "Summer Sale",
  subtitle: "",
  imageUrl: "",
  ctaLabel: "",
  ctaHref: "",
  theme: "",
  sortOrder: 0,
  status: "DRAFT",
  scheduledAt: "",
};

// Input-shaped values (pre-parse) — used with `bannerSchema.safeParse`, where
// sortOrder is still bound to a text input (string).
const baseInput: BannerFormInput = {
  placement: "HERO_SLIDE",
  title: "Summer Sale",
  subtitle: "",
  imageUrl: "",
  ctaLabel: "",
  ctaHref: "",
  theme: "",
  sortOrder: "0",
  status: "DRAFT",
  scheduledAt: "",
};

describe("bannerFormValuesToCreateDto", () => {
  it("drops blank optional strings so the backend treats them as omitted", () => {
    const dto = bannerFormValuesToCreateDto(baseValues);

    expect(dto.placement).toBe("HERO_SLIDE");
    expect(dto.title).toBe("Summer Sale");
    expect(dto.subtitle).toBeUndefined();
    expect(dto.imageUrl).toBeUndefined();
    expect(dto.ctaLabel).toBeUndefined();
    expect(dto.ctaHref).toBeUndefined();
    expect(dto.theme).toBeUndefined();
  });

  it("passes provided optional fields through", () => {
    const dto = bannerFormValuesToCreateDto({
      ...baseValues,
      placement: "PROMO_TILE",
      subtitle: "Up to -50%",
      imageUrl: "/images/summer.jpg",
      ctaLabel: "Shop now",
      ctaHref: "/catalog",
      theme: "accent",
      sortOrder: 3,
      status: "PUBLISHED",
    });

    expect(dto).toMatchObject({
      placement: "PROMO_TILE",
      subtitle: "Up to -50%",
      imageUrl: "/images/summer.jpg",
      ctaLabel: "Shop now",
      ctaHref: "/catalog",
      theme: "accent",
      sortOrder: 3,
      status: "PUBLISHED",
    });
  });

  it("sends an ISO scheduledAt for a SCHEDULED banner", () => {
    const dto = bannerFormValuesToCreateDto({
      ...baseValues,
      status: "SCHEDULED",
      scheduledAt: "2026-08-01T09:00",
    });

    expect(dto.status).toBe("SCHEDULED");
    expect(dto.scheduledAt).toBe(new Date("2026-08-01T09:00").toISOString());
  });

  it("omits scheduledAt when the banner is not SCHEDULED", () => {
    const dto = bannerFormValuesToCreateDto({
      ...baseValues,
      status: "PUBLISHED",
      scheduledAt: "2026-08-01T09:00",
    });

    expect(dto.scheduledAt).toBeUndefined();
  });

  it("update mapper mirrors the create mapper", () => {
    expect(bannerFormValuesToUpdateDto(baseValues)).toEqual(
      bannerFormValuesToCreateDto(baseValues),
    );
  });
});

describe("bannerSchema validation", () => {
  it("rejects a missing title", () => {
    const result = bannerSchema.safeParse({ ...baseInput, title: "" });
    expect(result.success).toBe(false);
  });

  it("accepts a valid banner", () => {
    const result = bannerSchema.safeParse(baseInput);
    expect(result.success).toBe(true);
  });

  it("rejects a non-numeric sort order", () => {
    const result = bannerSchema.safeParse({ ...baseInput, sortOrder: "abc" });
    expect(result.success).toBe(false);
  });

  it("requires scheduledAt when status is SCHEDULED", () => {
    const result = bannerSchema.safeParse({
      ...baseInput,
      status: "SCHEDULED",
      scheduledAt: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a SCHEDULED banner with a scheduledAt", () => {
    const result = bannerSchema.safeParse({
      ...baseInput,
      status: "SCHEDULED",
      scheduledAt: "2026-08-01T09:00",
    });
    expect(result.success).toBe(true);
  });
});
