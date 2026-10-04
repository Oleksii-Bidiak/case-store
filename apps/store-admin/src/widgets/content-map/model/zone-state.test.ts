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
  carouselZoneState,
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

describe("carouselZoneState", () => {
  const carousel = (title: string, placement: string, sortOrder: number) =>
    ({ id: title, title, placement, sortOrder, status: "PUBLISHED" }) as never;

  it("names the live tabs in display order", () => {
    expect(
      carouselZoneState(
        [
          carousel("Новинки", "HOME_TABS", 1),
          carousel("Хіти", "HOME_TABS", 0),
          carousel("Чохли", "HOME_RAILS", 0),
        ],
        "HOME_TABS",
      ),
    ).toEqual({
      status: "ready",
      summary: c.carouselTabsState(2, "Хіти, Новинки"),
    });
  });

  it("quotes the rails", () => {
    expect(
      carouselZoneState([carousel("Чохли", "HOME_RAILS", 0)], "HOME_RAILS"),
    ).toEqual({ status: "ready", summary: c.carouselRailsState(1, "«Чохли»") });
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
