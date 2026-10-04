import { siteContactSchema } from "@/features/site-contact-form";
import { PageEntityKind } from "@/entities/page";
import { dict } from "@/shared/config";
import {
  CONTENT_MAP_TABS,
  CONTENT_MAP_ZONES,
  CONTENT_MAP_ZONE_BY_ID,
  type ContentMapZoneId,
} from "./content-map-zones";

describe("content-map config (TASK-264-A; tabs since wave 198, TASK-1076)", () => {
  it("keeps every zone the map ever had, with unique ids, plus the three new ones", () => {
    const ids = CONTENT_MAP_ZONES.map((zone) => zone.id);
    expect(new Set(ids).size).toBe(ids.length);
    const required: ContentMapZoneId[] = [
      "announcement-bar",
      "hero-slide",
      "promo-tile",
      "promo-banner",
      "faq",
      "legal-pages",
      "info-pages",
      "hub-pages",
      "blog",
      "site-contact",
      "seo-settings",
      "promo-codes",
      // Wave 198: carousels as home zones, sale products on «Акції».
      "carousel-tabs",
      "carousel-rails",
      "sale-products",
    ];
    expect(new Set(ids)).toEqual(new Set(required));
  });

  it("has the six storefront pages as tabs, with the artboard's zone counts", () => {
    expect(CONTENT_MAP_TABS.map((tab) => [tab.id, tab.zones.length])).toEqual([
      ["home", 7],
      ["all", 4],
      ["promo", 2],
      ["info", 2],
      ["blog", 1],
      ["legal", 1],
    ]);
  });

  it("puts every zone on at least one tab, and every tab zone resolves", () => {
    const listed = new Set(
      CONTENT_MAP_TABS.flatMap((tab) => tab.zones.map((zone) => zone.id)),
    );
    for (const zone of CONTENT_MAP_ZONES) expect(listed).toContain(zone.id);
    for (const id of listed) expect(CONTENT_MAP_ZONE_BY_ID[id]).toBeDefined();
  });

  it("numbers schema blocks only with zones that exist on that tab", () => {
    for (const tab of CONTENT_MAP_TABS) {
      const numbers = tab.blocks.flatMap((block) =>
        "row" in block
          ? block.row.map((cell) => cell.zone)
          : block.zone
            ? [block.zone]
            : [],
      );
      for (const n of numbers) {
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(tab.zones.length);
      }
    }
  });

  it("page zones deep-link with a ?kind= param matching their counted kind", () => {
    const pageZones = CONTENT_MAP_ZONES.filter(
      (zone) => zone.source.kind === "pages",
    );
    expect(pageZones).toHaveLength(3);
    for (const zone of pageZones) {
      if (zone.source.kind !== "pages") continue;
      expect(zone.targetHref).toBe(`/pages?kind=${zone.source.pageKind}`);
    }
    expect(
      pageZones.map((zone) =>
        zone.source.kind === "pages" ? zone.source.pageKind : null,
      ),
    ).toEqual(
      expect.arrayContaining([
        PageEntityKind.LEGAL,
        PageEntityKind.INFO,
        PageEntityKind.HUB,
      ]),
    );
  });

  it("banner zones deep-link with a ?placement= param matching their placement", () => {
    for (const zone of CONTENT_MAP_ZONES) {
      if (zone.source.kind !== "banner") continue;
      expect(zone.targetHref).toBe(
        `/banners?placement=${zone.source.placement}`,
      );
    }
  });

  // TASK-720: one slot, one name.
  it("names each banner zone exactly as the Banners screen names its placement", () => {
    const bannerZones = CONTENT_MAP_ZONES.filter(
      (zone) => zone.source.kind === "banner",
    );
    expect(bannerZones).toHaveLength(4);
    for (const zone of bannerZones) {
      if (zone.source.kind !== "banner") continue;
      const { placement } = zone.source;
      expect(zone.sourceLabel).toBe(dict.banners.placements[placement]);
      expect(zone.sourceLabel).toBe(dict.bannerForm.placements[placement]);
    }
  });

  it("puts the storefront /promo page on the map, pointing at /discounts", () => {
    const promo = CONTENT_MAP_ZONE_BY_ID["promo-codes"];
    expect(promo.targetHref).toBe("/discounts");
    expect(promo.sitePath).toBe("/promo");
    expect(
      CONTENT_MAP_TABS.find((tab) => tab.id === "promo")?.zones[0].id,
    ).toBe("promo-codes");
  });

  it("offers «на сайті» only for zones visible on a page", () => {
    expect(CONTENT_MAP_ZONE_BY_ID["seo-settings"].sitePath).toBeNull();
    expect(CONTENT_MAP_ZONE_BY_ID["hub-pages"].sitePath).toBeNull();
    expect(CONTENT_MAP_ZONE_BY_ID.blog.sitePath).toBe("/blog");
  });

  it("marks the carousels as edited on the later /home screen (Д-н2)", () => {
    expect(CONTENT_MAP_ZONE_BY_ID["carousel-tabs"].later).toBe(true);
    expect(CONTENT_MAP_ZONE_BY_ID["carousel-rails"].later).toBe(true);
  });

  it("every zone exposes non-empty labels", () => {
    for (const zone of CONTENT_MAP_ZONES) {
      expect(zone.sourceLabel.trim()).not.toBe("");
      expect(zone.targetLabel.trim()).not.toBe("");
      expect(zone.appliesTo.trim()).not.toBe("");
    }
  });

  // TASK-721: the map once promised an address the Contacts form has no field
  // for. The zone now SAYS what is filled; its words must cover exactly the
  // form's fields — checked against the form's own schema.
  it("describes only what the Contacts form edits", () => {
    const p = dict.contentMap.contactParts;
    const wordForField: Record<string, string> = {
      email: p.email,
      phone: p.phone,
      workingHours: p.hours,
      viberLink: p.messengers(1),
      telegramLink: p.messengers(1),
      instagramLink: p.instagram,
    };
    expect(new Set(Object.keys(siteContactSchema.shape))).toEqual(
      new Set(Object.keys(wordForField)),
    );
    expect(Object.values(p).join(" ")).not.toMatch(/адрес/i);
  });

  it("titles the page with the sidebar item's name", () => {
    expect(dict.contentMap.heading).toBe(dict.nav.contentMap);
    expect(dict.contentMap.metaTitle.startsWith(dict.nav.contentMap)).toBe(
      true,
    );
  });
});
