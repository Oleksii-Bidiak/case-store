import { BannerEntityPlacement } from "@/entities/banner";
import { CarouselEntityPlacement } from "@/entities/carousel";
import { PageEntityKind } from "@/entities/page";
import { dict } from "@/shared/config";

const z = dict.contentMap.zones;
const b = dict.contentMap.blocks;

/**
 * Content-map model (TASK-264-A; tabs by storefront page since wave 198 —
 * ContentMapProposal ДЩ1–ДЩ4, TASK-1076). The static source of truth that maps
 * each storefront region to the admin section that edits it. Placements are
 * TypeScript enums baked into the codebase, so a new placement always needs a
 * code change anyway, at which point this file is updated in the same PR.
 */

export type ContentMapZoneId =
  | "announcement-bar"
  | "hero-slide"
  | "promo-tile"
  | "promo-banner"
  | "carousel-tabs"
  | "carousel-rails"
  | "faq"
  | "legal-pages"
  | "info-pages"
  | "hub-pages"
  | "blog"
  | "site-contact"
  | "seo-settings"
  | "promo-codes"
  | "sale-products";

/**
 * Where a zone's live state comes from. Typed against the real enums
 * ({@link BannerEntityPlacement}, {@link CarouselEntityPlacement},
 * {@link PageEntityKind}) so a renamed placement or a new kind surfaces as a
 * compile error here rather than silently miscounting.
 */
export type ContentMapZoneSource =
  | { kind: "banner"; placement: BannerEntityPlacement }
  | { kind: "carousel"; placement: CarouselEntityPlacement }
  | { kind: "faq" }
  | { kind: "pages"; pageKind: PageEntityKind }
  | { kind: "blog" }
  | { kind: "contacts" }
  | { kind: "seo" }
  | { kind: "promo-codes" }
  | { kind: "sale-products" };

export interface ContentMapZone {
  id: ContentMapZoneId;
  /** The zone's title on its card — what the owner sees on the storefront. */
  sourceLabel: string;
  /** The admin section that edits it — the link's text. */
  targetLabel: string;
  /** Admin route to link to (may include a pre-filter query param). */
  targetHref: string;
  /** One line: where on the page the zone sits. */
  appliesTo: string;
  /** Storefront path for «на сайті ↗»; `null` = invisible on the page. */
  sitePath: string | null;
  source: ContentMapZoneSource;
  /** Drawn here, edited on a later screen (`/home`, Д-н2 — TASK-662/664). */
  later?: boolean;
}

/**
 * Every zone of the map. Banner `targetHref`s carry the `?placement=` deep link
 * `AdminBannerTable` reads (TASK-264-C), the page zones the `?kind=` of
 * `AdminPageTable`'s views.
 */
export const CONTENT_MAP_ZONES: readonly ContentMapZone[] = [
  {
    id: "announcement-bar",
    sourceLabel: z.announcementBar.source,
    targetLabel: z.announcementBar.target,
    targetHref: `/banners?placement=${BannerEntityPlacement.ANNOUNCEMENT_BAR}`,
    appliesTo: z.announcementBar.appliesTo,
    sitePath: "/",
    source: {
      kind: "banner",
      placement: BannerEntityPlacement.ANNOUNCEMENT_BAR,
    },
  },
  {
    id: "hero-slide",
    sourceLabel: z.heroSlide.source,
    targetLabel: z.heroSlide.target,
    targetHref: `/banners?placement=${BannerEntityPlacement.HERO_SLIDE}`,
    appliesTo: z.heroSlide.appliesTo,
    sitePath: "/",
    source: { kind: "banner", placement: BannerEntityPlacement.HERO_SLIDE },
  },
  {
    id: "promo-tile",
    sourceLabel: z.promoTile.source,
    targetLabel: z.promoTile.target,
    targetHref: `/banners?placement=${BannerEntityPlacement.PROMO_TILE}`,
    appliesTo: z.promoTile.appliesTo,
    sitePath: "/",
    source: { kind: "banner", placement: BannerEntityPlacement.PROMO_TILE },
  },
  {
    id: "carousel-tabs",
    sourceLabel: z.carouselTabs.source,
    targetLabel: z.carouselTabs.target,
    targetHref: "/carousels",
    appliesTo: z.carouselTabs.appliesTo,
    sitePath: "/",
    source: { kind: "carousel", placement: CarouselEntityPlacement.HOME_TABS },
    later: true,
  },
  {
    id: "promo-banner",
    sourceLabel: z.promoBanner.source,
    targetLabel: z.promoBanner.target,
    targetHref: `/banners?placement=${BannerEntityPlacement.PROMO_BANNER}`,
    appliesTo: z.promoBanner.appliesTo,
    sitePath: "/",
    source: { kind: "banner", placement: BannerEntityPlacement.PROMO_BANNER },
  },
  {
    id: "carousel-rails",
    sourceLabel: z.carouselRails.source,
    targetLabel: z.carouselRails.target,
    targetHref: "/carousels",
    appliesTo: z.carouselRails.appliesTo,
    sitePath: "/",
    source: {
      kind: "carousel",
      placement: CarouselEntityPlacement.HOME_RAILS,
    },
    later: true,
  },
  {
    id: "site-contact",
    sourceLabel: z.siteContact.source,
    targetLabel: z.siteContact.target,
    targetHref: "/settings/contact",
    appliesTo: z.siteContact.appliesTo,
    sitePath: "/contact",
    source: { kind: "contacts" },
  },
  {
    id: "seo-settings",
    sourceLabel: z.seoSettings.source,
    targetLabel: z.seoSettings.target,
    targetHref: "/settings/seo",
    appliesTo: z.seoSettings.appliesTo,
    sitePath: null,
    source: { kind: "seo" },
  },
  {
    id: "hub-pages",
    sourceLabel: z.hubPages.source,
    targetLabel: z.hubPages.target,
    targetHref: `/pages?kind=${PageEntityKind.HUB}`,
    appliesTo: z.hubPages.appliesTo,
    sitePath: null,
    source: { kind: "pages", pageKind: PageEntityKind.HUB },
  },
  // AD-CNT-26 (TASK-429): `/promo` is a real storefront page linked from the
  // header; the map sends the owner to «Промокоди».
  {
    id: "promo-codes",
    sourceLabel: z.promoCodes.source,
    targetLabel: z.promoCodes.target,
    targetHref: "/discounts",
    appliesTo: z.promoCodes.appliesTo,
    sitePath: "/promo",
    source: { kind: "promo-codes" },
  },
  {
    id: "sale-products",
    sourceLabel: z.saleProducts.source,
    targetLabel: z.saleProducts.target,
    targetHref: "/products",
    appliesTo: z.saleProducts.appliesTo,
    sitePath: "/promo",
    source: { kind: "sale-products" },
  },
  {
    id: "info-pages",
    sourceLabel: z.infoPages.source,
    targetLabel: z.infoPages.target,
    targetHref: `/pages?kind=${PageEntityKind.INFO}`,
    appliesTo: z.infoPages.appliesTo,
    sitePath: "/info",
    source: { kind: "pages", pageKind: PageEntityKind.INFO },
  },
  {
    id: "faq",
    sourceLabel: z.faq.source,
    targetLabel: z.faq.target,
    targetHref: "/faq",
    appliesTo: z.faq.appliesTo,
    sitePath: "/info",
    source: { kind: "faq" },
  },
  {
    id: "blog",
    sourceLabel: z.blog.source,
    targetLabel: z.blog.target,
    targetHref: "/blog",
    appliesTo: z.blog.appliesTo,
    sitePath: "/blog",
    source: { kind: "blog" },
  },
  {
    id: "legal-pages",
    sourceLabel: z.legalPages.source,
    targetLabel: z.legalPages.target,
    targetHref: `/pages?kind=${PageEntityKind.LEGAL}`,
    appliesTo: z.legalPages.appliesTo,
    sitePath: "/legal",
    source: { kind: "pages", pageKind: PageEntityKind.LEGAL },
  },
];

export type ContentMapTabId =
  "home" | "all" | "promo" | "info" | "blog" | "legal";

/** A zone as listed under one tab — numbered by its position, 1-based. */
export interface ContentMapTabZone {
  id: ContentMapZoneId;
  /** This page's wording when the zone also sits on another tab. */
  title?: string;
  appliesTo?: string;
}

/** How tall a block of the page schema is drawn. */
export type SchemaBlockSize = "xs" | "sm" | "md" | "lg" | "xl";

/**
 * One block of the page schema. `zone` is the 1-based number of the zone in
 * the tab's list (the same number on the card); none = a part of the page no
 * content zone controls (the header, the products) — drawn grey.
 */
export type SchemaBlock =
  | { zone?: number; label: string; size: SchemaBlockSize }
  | { row: { zone: number; label: string }[] };

export interface ContentMapTab {
  id: ContentMapTabId;
  label: string;
  schemaTitle: string;
  zones: readonly ContentMapTabZone[];
  blocks: readonly SchemaBlock[];
}

const t = dict.contentMap.tabs;
const s = dict.contentMap.schemaTitles;

/**
 * The storefront pages as tabs, each with its zones top-to-bottom and the page
 * schema the zone numbers point into.
 */
export const CONTENT_MAP_TABS: readonly ContentMapTab[] = [
  {
    id: "home",
    label: t.home,
    schemaTitle: s.home,
    zones: [
      { id: "announcement-bar" },
      { id: "hero-slide" },
      { id: "promo-tile" },
      { id: "carousel-tabs" },
      { id: "promo-banner" },
      { id: "carousel-rails" },
      {
        id: "site-contact",
        title: dict.contentMap.contactsFooter,
        appliesTo: dict.contentMap.contactsFooterWhere,
      },
    ],
    blocks: [
      { zone: 1, label: z.announcementBar.source, size: "xs" },
      { label: b.headerFull, size: "sm" },
      { zone: 2, label: z.heroSlide.source, size: "xl" },
      {
        row: [
          { zone: 3, label: b.tile },
          { zone: 3, label: b.tile },
          { zone: 3, label: b.tile },
        ],
      },
      { zone: 4, label: z.carouselTabs.source, size: "lg" },
      { zone: 5, label: z.promoBanner.source, size: "md" },
      { zone: 6, label: z.carouselRails.source, size: "lg" },
      { zone: 7, label: b.footer, size: "md" },
    ],
  },
  {
    id: "all",
    label: t.all,
    schemaTitle: s.all,
    zones: [
      {
        id: "announcement-bar",
        appliesTo: dict.contentMap.announcementEverywhere,
      },
      { id: "site-contact" },
      { id: "seo-settings" },
      { id: "hub-pages" },
    ],
    blocks: [
      { zone: 1, label: z.announcementBar.source, size: "xs" },
      { label: b.header, size: "sm" },
      { label: b.pageBody, size: "xl" },
      { zone: 2, label: b.footer, size: "md" },
    ],
  },
  {
    id: "promo",
    label: t.promo,
    schemaTitle: s.promo,
    zones: [{ id: "promo-codes" }, { id: "sale-products" }],
    blocks: [
      { label: b.headerFull, size: "sm" },
      { zone: 1, label: z.promoCodes.source, size: "lg" },
      { zone: 2, label: z.saleProducts.source, size: "xl" },
      { label: b.footer, size: "md" },
    ],
  },
  {
    id: "info",
    label: t.info,
    schemaTitle: s.info,
    zones: [{ id: "info-pages" }, { id: "faq" }],
    blocks: [
      { label: b.headerFull, size: "sm" },
      { zone: 1, label: b.infoBlocks, size: "xl" },
      { zone: 2, label: b.faq, size: "lg" },
      { label: b.footer, size: "md" },
    ],
  },
  {
    id: "blog",
    label: t.blog,
    schemaTitle: s.blog,
    zones: [{ id: "blog" }],
    blocks: [
      { label: b.headerFull, size: "sm" },
      { zone: 1, label: b.blogFeed, size: "xl" },
      { label: b.footer, size: "md" },
    ],
  },
  {
    id: "legal",
    label: t.legal,
    schemaTitle: s.legal,
    zones: [{ id: "legal-pages" }],
    blocks: [
      { label: b.headerFull, size: "sm" },
      { zone: 1, label: b.legalList, size: "xl" },
      { label: b.footer, size: "md" },
    ],
  },
];

/** Zone lookup by id. */
export const CONTENT_MAP_ZONE_BY_ID: Record<ContentMapZoneId, ContentMapZone> =
  Object.fromEntries(
    CONTENT_MAP_ZONES.map((zone) => [zone.id, zone]),
  ) as Record<ContentMapZoneId, ContentMapZone>;
