import {
  bannerSchema,
  bannerFormValuesToCreateDto,
  bannerFormValuesToUpdateDto,
  type BannerFormInput,
  type BannerFormValues,
} from "./banner-schema";
import { formatDateTime } from "@/shared/lib";

/**
 * Normalise ICU's space variants (NBSP / narrow NBSP turn up inside date-time
 * patterns) so the assertions test the FORMAT, not which flavour of space the
 * bundled ICU shipped. Same trick, same reason as `formatDate.test.ts`.
 */
const norm = (s: string) => s.replace(/\s+/g, " ");

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
  scheduledUntil: "",
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
  scheduledUntil: "",
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
    // 09:00 Kyiv on 1 August is 06:00 UTC (EEST, UTC+3). Hard-coded on purpose:
    // the expectation this replaced was `new Date("2026-08-01T09:00")
    // .toISOString()`, the very expression the mapper used, so it agreed with
    // any implementation — including the browser-zone one that was wrong
    // everywhere outside Kyiv.
    expect(dto.scheduledAt).toBe("2026-08-01T06:00:00.000Z");
  });

  // The invariant an operator actually cares about: the wall-clock time they
  // typed is the wall-clock time the banner goes live — where "wall clock" means
  // KYIV, because that is what the banner list shows them (TASK-421 finding #10).
  //
  // Investigated under TASK-388 as a suspected cause of "I scheduled it and
  // nothing happened". The round trip was self-consistent, which is why it
  // survived: browser-zone in, browser-zone out returns the same instant. What it
  // was NOT is consistent with the LIST — and the list is where the operator
  // reads the date before re-typing it here.
  //
  // Asserted through `formatDateTime`, the same formatter the list renders with,
  // so this cannot pass by agreeing with the mapper's own arithmetic.
  it("stores the instant the operator's KYIV clock showed", () => {
    const typed = "2026-08-01T09:00";

    const dto = bannerFormValuesToCreateDto({
      ...baseValues,
      status: "SCHEDULED",
      scheduledAt: typed,
    });

    expect(norm(formatDateTime(dto.scheduledAt as string))).toBe(
      "01.08.2026, 09:00",
    );
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

// ─── publication window (TASK-429) ───────────────────────────────────────────

describe("bannerSchema — publication window (TASK-429)", () => {
  it("accepts a window whose end is after its start", () => {
    const result = bannerSchema.safeParse({
      ...baseInput,
      status: "SCHEDULED",
      scheduledAt: "2026-08-01T09:00",
      scheduledUntil: "2026-09-01T09:00",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an end BEFORE the start", () => {
    const result = bannerSchema.safeParse({
      ...baseInput,
      status: "SCHEDULED",
      scheduledAt: "2026-09-01T09:00",
      scheduledUntil: "2026-08-01T09:00",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["scheduledUntil"]);
  });

  it("rejects an end EQUAL to the start — that is a zero-length window", () => {
    const result = bannerSchema.safeParse({
      ...baseInput,
      status: "SCHEDULED",
      scheduledAt: "2026-08-01T09:00",
      scheduledUntil: "2026-08-01T09:00",
    });
    expect(result.success).toBe(false);
  });

  // The window comparison resolves both ends through `fromKyivDateTimeLocal`
  // rather than `Date.parse` (TASK-421 finding #10). These two cover what that
  // swap has to keep true: a window that STRADDLES a DST switch is still ordered
  // correctly even though its two ends sit at different UTC offsets, and a value
  // the helper cannot resolve at all makes the rule step aside instead of
  // inventing an "inverted window" error the operator cannot act on.
  it("orders a window that straddles the autumn DST switch", () => {
    const result = bannerSchema.safeParse({
      ...baseInput,
      status: "SCHEDULED",
      scheduledAt: "2026-10-25T02:30", // still EEST, UTC+3
      scheduledUntil: "2026-10-25T03:30", // already EET, UTC+2
    });

    expect(result.success).toBe(true);
  });

  it("stays silent about the window when an end is not a real moment", () => {
    const result = bannerSchema.safeParse({
      ...baseInput,
      status: "SCHEDULED",
      scheduledAt: "2026-08-01T09:00",
      scheduledUntil: "not-a-date",
    });

    expect(result.success).toBe(true);
  });

  it("accepts a lone end on a PUBLISHED banner — live now, down on the 1st", () => {
    const result = bannerSchema.safeParse({
      ...baseInput,
      status: "PUBLISHED",
      scheduledUntil: "2026-09-01T00:00",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty end (no take-down date at all)", () => {
    const result = bannerSchema.safeParse({
      ...baseInput,
      status: "PUBLISHED",
      scheduledUntil: "",
    });
    expect(result.success).toBe(true);
  });
});

describe("bannerFormValuesToCreateDto — publication window (TASK-429)", () => {
  it("sends the end as an ISO instant for a PUBLISHED banner", () => {
    const dto = bannerFormValuesToCreateDto({
      ...baseValues,
      status: "PUBLISHED",
      scheduledUntil: "2026-09-01T00:00",
    });

    // Midnight Kyiv on 1 September is 21:00 UTC on 31 AUGUST — the case where a
    // browser-zone parse moved the take-down to the wrong DAY, not just the
    // wrong hour.
    expect(dto.scheduledUntil).toBe("2026-08-31T21:00:00.000Z");
  });

  it("sends both ends for a SCHEDULED banner", () => {
    const dto = bannerFormValuesToCreateDto({
      ...baseValues,
      status: "SCHEDULED",
      scheduledAt: "2026-08-01T09:00",
      scheduledUntil: "2026-09-01T09:00",
    });

    expect(dto.scheduledAt).toBe("2026-08-01T06:00:00.000Z");
    expect(dto.scheduledUntil).toBe("2026-09-01T06:00:00.000Z");
  });

  it("omits the end for a DRAFT — nothing is up, so nothing comes down", () => {
    const dto = bannerFormValuesToCreateDto({
      ...baseValues,
      status: "DRAFT",
      scheduledUntil: "2026-09-01T00:00",
    });

    expect(dto.scheduledUntil).toBeUndefined();
  });

  it("omits the end when the field is left empty", () => {
    const dto = bannerFormValuesToCreateDto({
      ...baseValues,
      status: "PUBLISHED",
      scheduledUntil: "",
    });

    expect(dto.scheduledUntil).toBeUndefined();
  });
});
