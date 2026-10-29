import type { BannerEntity } from "@/entities/banner";
import type { DiscountEntity } from "@/entities/discount";
import type {
  SeoHealthEntity,
  SeoSettingsEntity,
} from "@/entities/seo-settings";
import type { SiteContactSettingsEntity } from "@/entities/site-contact";
import { formatDate } from "@/shared/lib";
import { dict } from "@/shared/config";
import {
  bannerZoneState,
  homeBlocksZoneState,
  homeCarouselZoneState,
  contactsZoneState,
  promoCodesZoneState,
  seoZoneState,
} from "./zone-state";

const c = dict.contentMap;
const NOW = Date.parse("2026-10-01T09:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString();

function banner(overrides: Partial<BannerEntity>): BannerEntity {
  return {
    id: "b",
    placement: "PROMO_TILE",
    title: "b",
    sortOrder: 0,
    status: "PUBLISHED",
    createdAt: iso(NOW),
    updatedAt: iso(NOW),
    ...overrides,
  } as BannerEntity;
}

describe("bannerZoneState", () => {
  it("counts live and scheduled, and dates the next start", () => {
    const state = bannerZoneState(
      [
        banner({ id: "1" }),
        banner({
          id: "2",
          status: "SCHEDULED",
          scheduledAt: iso(NOW + 9 * DAY),
        }),
        banner({ id: "3", placement: "HERO_SLIDE" }),
      ],
      "PROMO_TILE",
      NOW,
    );
    expect(state).toEqual({
      status: "ready",
      summary: `${c.shown(1)} · ${c.scheduled(1)}`,
      badge: {
        text: c.startsBadge(formatDate(iso(NOW + 9 * DAY)).slice(0, 5)),
        tone: "muted",
      },
    });
  });

  it("warns when a live banner comes down, with the days left", () => {
    const until = iso(NOW + 14 * DAY);
    const state = bannerZoneState(
      [banner({ placement: "ANNOUNCEMENT_BAR", scheduledUntil: until })],
      "ANNOUNCEMENT_BAR",
      NOW,
    );
    expect(state).toMatchObject({
      badge: {
        text: c.endsBadge(formatDate(until).slice(0, 5), 14),
        tone: "warning",
      },
    });
  });

  it("says nothing shows when the placement is empty", () => {
    expect(bannerZoneState([], "HERO_SLIDE", NOW)).toEqual({
      status: "ready",
      summary: c.shown(0),
    });
  });
});

describe("homeCarouselZoneState (TASK-660)", () => {
  const carousel = (title: string, status = "PUBLISHED") => ({
    id: title,
    title,
    source: "NEWEST",
    status,
  });
  const block = (
    type: "TABS" | "CAROUSEL" | "HERO",
    sortOrder: number,
    extra: Record<string, unknown> = {},
  ) =>
    ({
      id: `${type}-${sortOrder}`,
      type,
      sortOrder,
      status: "PUBLISHED",
      carousel: null,
      tabs: [],
      ...extra,
    }) as never;
  const blocks = [
    block("CAROUSEL", 4, { carousel: carousel("Чохли") }),
    block("TABS", 3, {
      tabs: [
        { sortOrder: 0, carousel: carousel("Хіти") },
        { sortOrder: 1, carousel: carousel("Чернетка", "DRAFT") },
        { sortOrder: 2, carousel: carousel("Новинки") },
      ],
    }),
    block("CAROUSEL", 5, { carousel: carousel("Прихована", "DRAFT") }),
    block("CAROUSEL", 6, { status: "DRAFT", carousel: carousel("Сховано") }),
    block("CAROUSEL", 7, { carousel: null }),
    block("HERO", 0),
  ];

  it("names the live tabs of the TABS blocks, in page order", () => {
    expect(homeCarouselZoneState(blocks, "tabs")).toEqual({
      status: "ready",
      summary: c.carouselTabsState(2, "Хіти, Новинки"),
    });
  });

  it("quotes only the rails a shopper can see", () => {
    expect(homeCarouselZoneState(blocks, "rails")).toEqual({
      status: "ready",
      summary: c.carouselRailsState(1, "«Чохли»"),
    });
  });

  it("says nothing is shown when no block carries a live carousel", () => {
    expect(homeCarouselZoneState([block("HERO", 0)], "rails")).toEqual({
      status: "ready",
      summary: c.shown(0),
    });
  });

  // TASK-664: the «Блоки головної» zone.
  it("counts the live sections and warns only about empty live rails", () => {
    expect(
      homeBlocksZoneState([
        block("HERO", 0),
        block("CAROUSEL", 1, { isEmpty: true }),
        // An empty TABS block falls back to automatic tabs — not «без товарів».
        block("TABS", 2, { isEmpty: true }),
        block("CAROUSEL", 3, { status: "SCHEDULED" }),
        block("CAROUSEL", 4, { status: "DRAFT", isEmpty: true }),
      ]),
    ).toEqual({
      status: "ready",
      summary: `${c.homeBlocksState(3)} · ${c.scheduled(1)}`,
      badge: { text: c.homeBlocksEmpty(1), tone: "warning" },
    });
    expect(homeBlocksZoneState([block("HERO", 0)])).toEqual({
      status: "ready",
      summary: c.homeBlocksState(1),
    });
  });
});

describe("contactsZoneState", () => {
  const settings = (o: Partial<SiteContactSettingsEntity>) =>
    ({
      id: "x",
      createdAt: "",
      updatedAt: "",
      ...o,
    }) as SiteContactSettingsEntity;

  it("lists what is filled", () => {
    expect(
      contactsZoneState(
        settings({
          phone: "+380",
          email: "a@b.c",
          workingHours: "9–18",
          viberLink: "viber://x",
          telegramLink: "https://t.me/x",
        }),
      ),
    ).toEqual({
      status: "ready",
      summary: [
        c.contactParts.phone,
        c.contactParts.email,
        c.contactParts.hours,
        c.contactParts.messengers(2),
      ].join(", "),
    });
  });

  it("asks to fill an empty form", () => {
    expect(contactsZoneState(settings({}))).toEqual({
      status: "ready",
      summary: c.contactsEmpty,
      badge: { text: c.contactsFill, tone: "warning" },
    });
  });
});

describe("seoZoneState", () => {
  const health = (o: Partial<SeoHealthEntity> = {}) =>
    ({
      pagesMissingMetaDescription: 0,
      pagesThinContent: 0,
      ...o,
    }) as SeoHealthEntity;
  const settings = (o: Partial<SeoSettingsEntity> = {}) =>
    ({
      defaultMetaTitle: "T",
      defaultMetaDescription: "D",
      noindexSite: false,
      ...o,
    }) as SeoSettingsEntity;

  it("counts the amber rows of «Стан SEO»", () => {
    expect(
      seoZoneState(
        settings({ defaultMetaDescription: null }),
        health({ pagesThinContent: 3 }),
      ),
    ).toEqual({
      status: "ready",
      summary: c.seoWarnings(2),
      badge: { text: c.seoCheck, tone: "warning" },
    });
  });

  it("says when there is nothing to fix", () => {
    expect(seoZoneState(settings(), health())).toEqual({
      status: "ready",
      summary: c.seoWarnings(0),
    });
  });
});

describe("promoCodesZoneState", () => {
  const discount = (o: Partial<DiscountEntity>) =>
    ({
      code: "X",
      isActive: true,
      showOnPromoPage: true,
      expiresAt: null,
      ...o,
    }) as DiscountEntity;

  it("names what /promo shows and flags expired codes still ticked for it", () => {
    expect(
      promoCodesZoneState(
        [{ code: "SUMMER500" }, { code: "AUTUMN" }],
        [
          discount({ code: "SUMMER500" }),
          discount({ code: "OLD", expiresAt: iso(NOW - DAY) }),
          discount({
            code: "HIDDEN",
            expiresAt: iso(NOW - DAY),
            showOnPromoPage: false,
          }),
        ],
        NOW,
      ),
    ).toEqual({
      status: "ready",
      summary: c.promoShown(2, "SUMMER500, AUTUMN"),
      badge: { text: c.promoExpired(1), tone: "warning" },
    });
  });

  it("works without the admin list (no discounts:write)", () => {
    expect(promoCodesZoneState([], undefined, NOW)).toEqual({
      status: "ready",
      summary: c.promoShown(0, ""),
    });
  });
});
