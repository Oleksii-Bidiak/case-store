import {
  bannerSchema,
  bannerFormValuesToCreateDto,
  bannerFormValuesToUpdateDto,
  type BannerFormInput,
  type BannerFormValues,
} from "./banner-schema";

// Output-shaped values (post-parse) — used by the DTO mappers, which consume
// `BannerFormValues`. TASK-295 removed the `sortOrder` field from the form: the
// order lives in the sortable banner grid, never in a hand-typed number input.
const baseValues: BannerFormValues = {
  placement: "HERO_SLIDE",
  title: "Summer Sale",
  subtitle: "",
  imageUrl: "",
  ctaLabel: "",
  ctaHref: "",
  theme: "",
  status: "DRAFT",
  scheduledAt: "",
};

// Input-shaped values (pre-parse) — used with `bannerSchema.safeParse`.
const baseInput: BannerFormInput = {
  placement: "HERO_SLIDE",
  title: "Summer Sale",
  subtitle: "",
  imageUrl: "",
  ctaLabel: "",
  ctaHref: "",
  theme: "",
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
      status: "PUBLISHED",
    });

    expect(dto).toMatchObject({
      placement: "PROMO_TILE",
      subtitle: "Up to -50%",
      imageUrl: "/images/summer.jpg",
      ctaLabel: "Shop now",
      ctaHref: "/catalog",
      theme: "accent",
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

  // Non-tautological companion to the test above, which computes its expectation
  // with the same expression the implementation uses and so would survive any
  // rewrite. This states the invariant an operator actually cares about: the
  // wall-clock time they typed is the wall-clock time the banner goes live.
  //
  // Investigated under TASK-388 as a suspected cause of "I scheduled it and
  // nothing happened": the round trip is CORRECT. A `datetime-local` value is
  // interpreted in the browser's own zone, `new Date(...).toISOString()` converts
  // it to the right instant, and `toDateTimeLocal` in the edit views converts it
  // back with local getters. The test exists to keep it that way — the tempting
  // "simplification" is `values.scheduledAt + ":00Z"`, which silently shifts
  // every schedule by the operator's UTC offset (three hours in Ukraine).
  it("stores the instant the operator's own clock showed", () => {
    const typed = "2026-08-01T09:00";

    const dto = bannerFormValuesToCreateDto({
      ...baseValues,
      status: "SCHEDULED",
      scheduledAt: typed,
    });

    const stored = new Date(dto.scheduledAt as string);
    const pad = (n: number) => String(n).padStart(2, "0");
    const asOperatorSeesIt =
      `${stored.getFullYear()}-${pad(stored.getMonth() + 1)}-${pad(stored.getDate())}` +
      `T${pad(stored.getHours())}:${pad(stored.getMinutes())}`;

    expect(asOperatorSeesIt).toBe(typed);
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
