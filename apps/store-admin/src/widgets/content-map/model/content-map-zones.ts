import { BannerEntityPlacement } from "@/entities/banner";
import { dict } from "@/shared/config";

/**
 * Content-map zone model (TASK-264-A) — the static, hardcoded source of truth
 * that maps each storefront region to the admin section that edits it. There is
 * no runtime config and no admin form to manage this: placements are TypeScript
 * enums baked into the codebase, so a new placement always needs a code change
 * anyway, at which point this array is updated in the same PR.
 */

export type ContentMapZoneId =
  | "announcement-bar"
  | "hero-slide"
  | "promo-tile"
  | "promo-banner"
  | "faq"
  | "legal-pages"
  | "blog"
  | "site-contact"
  | "seo-settings";

/**
 * How a zone's active count is derived. The `banner` variant is typed against
 * the real {@link BannerEntityPlacement} enum (not a copied string union), so a
 * future placement addition/rename in the backend surfaces as a compile error
 * here rather than silently miscounting. `null` marks a singleton-settings zone
 * that has no "N active items" notion, so no count/marker is fetched or shown.
 */
export type ContentMapZoneCount =
  | { kind: "banner"; placement: BannerEntityPlacement }
  | { kind: "faq" }
  | { kind: "pages" }
  | { kind: "blog" }
  | null;

export interface ContentMapZone {
  id: ContentMapZoneId;
  /** Plain-UA label for what the owner sees on the storefront. */
  sourceLabel: string;
  /** Plain-UA label for the admin section this zone edits. */
  targetLabel: string;
  /** Admin route to link to (may include a pre-filter query param). */
  targetHref: string;
  /** Plain-UA note for which storefront page(s) this zone appears on. */
  appliesTo: string;
  count: ContentMapZoneCount;
}

/** One storefront "page frame" in the schematic, holding an ordered zone list. */
export interface ContentMapPageGroup {
  id: string;
  /** Plain-UA heading for the page/area this frame represents. */
  heading: string;
  zoneIds: ContentMapZoneId[];
}

/**
 * The nine content zones. Order within a group is the visual top-to-bottom
 * storefront order. Banner `targetHref`s carry a `?placement=` deep-link that
 * `AdminBannerTable` reads (TASK-264-C) to pre-filter to that one section; if
 * that reader hasn't shipped, the link still lands on the full `/banners` view.
 */
export const CONTENT_MAP_ZONES: readonly ContentMapZone[] = [
  {
    id: "announcement-bar",
    sourceLabel: dict.contentMap.zones.announcementBar.source,
    targetLabel: dict.contentMap.zones.announcementBar.target,
    targetHref: `/banners?placement=${BannerEntityPlacement.ANNOUNCEMENT_BAR}`,
    appliesTo: dict.contentMap.zones.announcementBar.appliesTo,
    count: {
      kind: "banner",
      placement: BannerEntityPlacement.ANNOUNCEMENT_BAR,
    },
  },
  {
    id: "site-contact",
    sourceLabel: dict.contentMap.zones.siteContact.source,
    targetLabel: dict.contentMap.zones.siteContact.target,
    targetHref: "/settings/contact",
    appliesTo: dict.contentMap.zones.siteContact.appliesTo,
    count: null,
  },
  {
    id: "seo-settings",
    sourceLabel: dict.contentMap.zones.seoSettings.source,
    targetLabel: dict.contentMap.zones.seoSettings.target,
    targetHref: "/settings/seo",
    appliesTo: dict.contentMap.zones.seoSettings.appliesTo,
    count: null,
  },
  {
    id: "hero-slide",
    sourceLabel: dict.contentMap.zones.heroSlide.source,
    targetLabel: dict.contentMap.zones.heroSlide.target,
    targetHref: `/banners?placement=${BannerEntityPlacement.HERO_SLIDE}`,
    appliesTo: dict.contentMap.zones.heroSlide.appliesTo,
    count: { kind: "banner", placement: BannerEntityPlacement.HERO_SLIDE },
  },
  {
    id: "promo-tile",
    sourceLabel: dict.contentMap.zones.promoTile.source,
    targetLabel: dict.contentMap.zones.promoTile.target,
    targetHref: `/banners?placement=${BannerEntityPlacement.PROMO_TILE}`,
    appliesTo: dict.contentMap.zones.promoTile.appliesTo,
    count: { kind: "banner", placement: BannerEntityPlacement.PROMO_TILE },
  },
  {
    id: "promo-banner",
    sourceLabel: dict.contentMap.zones.promoBanner.source,
    targetLabel: dict.contentMap.zones.promoBanner.target,
    targetHref: `/banners?placement=${BannerEntityPlacement.PROMO_BANNER}`,
    appliesTo: dict.contentMap.zones.promoBanner.appliesTo,
    count: { kind: "banner", placement: BannerEntityPlacement.PROMO_BANNER },
  },
  {
    id: "faq",
    sourceLabel: dict.contentMap.zones.faq.source,
    targetLabel: dict.contentMap.zones.faq.target,
    targetHref: "/faq",
    appliesTo: dict.contentMap.zones.faq.appliesTo,
    count: { kind: "faq" },
  },
  {
    id: "blog",
    sourceLabel: dict.contentMap.zones.blog.source,
    targetLabel: dict.contentMap.zones.blog.target,
    targetHref: "/blog",
    appliesTo: dict.contentMap.zones.blog.appliesTo,
    count: { kind: "blog" },
  },
  {
    id: "legal-pages",
    sourceLabel: dict.contentMap.zones.legalPages.source,
    targetLabel: dict.contentMap.zones.legalPages.target,
    targetHref: "/pages",
    appliesTo: dict.contentMap.zones.legalPages.appliesTo,
    count: { kind: "pages" },
  },
];

/**
 * The five storefront "page frames", in visual top-to-bottom order. Every
 * `zoneIds` entry must resolve to a zone in {@link CONTENT_MAP_ZONES} (pinned by
 * the config test).
 */
export const CONTENT_MAP_PAGE_GROUPS: readonly ContentMapPageGroup[] = [
  {
    id: "global",
    heading: dict.contentMap.groups.global,
    zoneIds: ["announcement-bar", "site-contact", "seo-settings"],
  },
  {
    id: "home",
    heading: dict.contentMap.groups.home,
    zoneIds: ["hero-slide", "promo-tile", "promo-banner"],
  },
  {
    id: "info",
    heading: dict.contentMap.groups.info,
    zoneIds: ["faq"],
  },
  {
    id: "blog",
    heading: dict.contentMap.groups.blog,
    zoneIds: ["blog"],
  },
  {
    id: "legal",
    heading: dict.contentMap.groups.legal,
    zoneIds: ["legal-pages"],
  },
];

/**
 * Derive a zone's shown/hidden marker from its resolved active count. Pure — no
 * hooks — so it is unit-tested in isolation. `count > 0` → "shown".
 */
export function resolveZoneVisibility(count: number): "shown" | "hidden" {
  return count > 0 ? "shown" : "hidden";
}
