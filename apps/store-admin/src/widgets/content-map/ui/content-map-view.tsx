"use client";

import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { useAdminBannerControllerFindAll } from "@/entities/banner";
import { useAdminHomeBlockControllerFindAll } from "@/entities/home-block";
import {
  useAdminListDiscounts,
  useListActiveDiscounts,
} from "@/entities/discount";
import { useAdminFaqControllerFindAll } from "@/entities/faq";
import { useAdminPageControllerFindAll } from "@/entities/page";
import { useAdminBlogControllerFindAll } from "@/entities/blog";
import { useProductControllerAdminFindAll } from "@/entities/product";
import {
  useAdminSeoSettingsControllerGetHealth,
  useSeoSettingsControllerGetSettings,
} from "@/entities/seo-settings";
import { useSiteContactControllerGetSettings } from "@/entities/site-contact";
import { useAuth } from "@/entities/session";
import { PERM } from "@/entities/permission";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui";
import { cn } from "@/shared/lib/utils";
import { dict } from "@/shared/config";
import {
  CONTENT_MAP_TABS,
  CONTENT_MAP_ZONE_BY_ID,
  type ContentMapTab,
  type ContentMapTabId,
  type ContentMapZoneSource,
} from "../model/content-map-zones";
import {
  bannerZoneState,
  homeBlocksZoneState,
  homeCarouselZoneState,
  contactsZoneState,
  promoCodesZoneState,
  seoZoneState,
  type ZoneState,
} from "../model/zone-state";
import { ContentMapSchema } from "./content-map-schema";
import { ContentMapZoneCard } from "./content-map-zone-card";

const c = dict.contentMap;

/** The lifecycle of one source, reduced to what a zone card needs. */
interface Source<T> {
  /** The session may read it — else the zone shows no state at all. */
  allowed: boolean;
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
}

function fromSource<T>(
  source: Source<T>,
  ready: (data: T) => ZoneState,
): ZoneState {
  if (!source.allowed) return { status: "unavailable" };
  if (source.isLoading) return { status: "loading" };
  if (source.isError || source.data === undefined) return { status: "error" };
  return ready(source.data);
}

/**
 * «Де що на сайті» (TASK-264-B; the sidebar item's name since TASK-720; tabs by
 * storefront page since wave 198 — ContentMapProposal ДЩ1–ДЩ4, TASK-1076).
 *
 * Each tab is one storefront page: its schema of numbered blocks next to the
 * list of zones, the selected one highlighted in both. Every zone card says
 * what is in it NOW, from list queries the screens behind it already use:
 *
 * - every admin source (banners, FAQ, pages, blog, the homepage blocks, the
 *   admin discount list, the product count, the SEO health check) is asked only
 *   when the session holds its key — `:read` or `:write` since TASK-666, when the
 *   nav started opening this page with ANY content key; a
 *   zone without its source shows its links and no state, never a 403 painted
 *   as an error (the AD-CNT-26 lesson);
 * - contacts, the SEO settings and the «Акції» promo list — public reads, the
 *   same the storefront renders.
 *
 * Each query is independent: one failing source degrades only its zones.
 */
export function ContentMapView() {
  const { can } = useAuth();
  // Read once: the end-date badges count days from the moment of the visit.
  const [now] = useState(() => Date.now());

  // TASK-666: each content source is read with its own `:read` OR `:write` key —
  // the nav opens this page with ANY of them, so a source the session cannot
  // read is never asked and its zones show no state rather than a 403.
  const canBanners = can(PERM.bannersRead) || can(PERM.bannersWrite);
  const canFaq = can(PERM.faqRead) || can(PERM.faqWrite);
  const canPages = can(PERM.pagesRead) || can(PERM.pagesWrite);
  const canBlog = can(PERM.blogRead) || can(PERM.blogWrite);

  // Banners: one fetch for every placement, all statuses — live, scheduled and
  // their end dates are all read from it.
  const banners = useAdminBannerControllerFindAll(undefined, {
    query: { enabled: canBanners },
  });
  const faq = useAdminFaqControllerFindAll(undefined, {
    query: { enabled: canFaq },
  });
  // Pages: one fetch for all three kinds, grouped client-side. `limit: 100` is
  // the API's maximum and comfortably above any real page count.
  const pages = useAdminPageControllerFindAll(
    { status: "PUBLISHED", limit: 100 },
    { query: { enabled: canPages } },
  );
  const blog = useAdminBlogControllerFindAll(
    { status: "PUBLISHED", limit: 1 },
    { query: { enabled: canBlog } },
  );

  // TASK-660: what the homepage shows is the homepage blocks' answer.
  const canHome = can(PERM.homeRead) || can(PERM.homeWrite);
  const homeBlocks = useAdminHomeBlockControllerFindAll({
    query: { enabled: canHome },
  });
  const contacts = useSiteContactControllerGetSettings();
  const seoSettings = useSeoSettingsControllerGetSettings();
  const canSeo = can(PERM.settingsSeo);
  const seoHealth = useAdminSeoSettingsControllerGetHealth({
    query: { enabled: canSeo },
  });
  const activeDiscounts = useListActiveDiscounts();
  const canDiscounts = can(PERM.discountsRead) || can(PERM.discountsWrite);
  const adminDiscounts = useAdminListDiscounts(
    { limit: 100 },
    { query: { enabled: canDiscounts } },
  );
  const canProducts = can(PERM.productsRead);
  const saleProducts = useProductControllerAdminFindAll(
    { onSale: true, isActive: true, limit: 1 },
    { query: { enabled: canProducts } },
  );

  const resolve = (source: ContentMapZoneSource): ZoneState => {
    switch (source.kind) {
      case "banner":
        return fromSource(
          { allowed: canBanners, ...pick(banners), data: banners.data?.data },
          (data) => bannerZoneState(data, source.placement, now),
        );
      case "home-blocks":
        return fromSource(
          {
            allowed: canHome,
            ...pick(homeBlocks),
            data: homeBlocks.data?.data,
          },
          homeBlocksZoneState,
        );
      case "home-carousels":
        return fromSource(
          {
            allowed: canHome,
            ...pick(homeBlocks),
            data: homeBlocks.data?.data,
          },
          (data) => homeCarouselZoneState(data, source.slot),
        );
      case "faq":
        return fromSource(
          { allowed: canFaq, ...pick(faq), data: faq.data?.data },
          (data) => ({
            status: "ready",
            summary: c.shown(data.filter((item) => item.isActive).length),
          }),
        );
      case "pages":
        return fromSource(
          { allowed: canPages, ...pick(pages), data: pages.data?.data },
          (data) => {
            const count = data.filter(
              (page) => page.kind === source.pageKind,
            ).length;
            return {
              status: "ready",
              summary:
                source.pageKind === "HUB"
                  ? c.hubs(count)
                  : source.pageKind === "INFO"
                    ? c.infoPagesState(count)
                    : c.legalPagesState(count),
            };
          },
        );
      case "blog":
        return fromSource(
          { allowed: canBlog, ...pick(blog), data: blog.data?.meta?.total },
          (total) => ({ status: "ready", summary: c.blogState(total) }),
        );
      case "contacts":
        return fromSource(
          { allowed: true, ...pick(contacts), data: contacts.data?.data },
          contactsZoneState,
        );
      case "seo": {
        if (!canSeo) return { status: "unavailable" };
        const settings = seoSettings.data?.data;
        const health = seoHealth.data?.data;
        return fromSource(
          {
            allowed: true,
            isLoading: seoSettings.isLoading || seoHealth.isLoading,
            isError: seoSettings.isError || seoHealth.isError,
            data: settings && health ? { settings, health } : undefined,
          },
          (data) => seoZoneState(data.settings, data.health),
        );
      }
      case "promo-codes":
        return fromSource(
          {
            allowed: true,
            ...pick(activeDiscounts),
            data: activeDiscounts.data?.data,
          },
          // The expired badge needs the admin list — present only with
          // `discounts:write`, and never blocking the public count.
          (active) =>
            promoCodesZoneState(
              active,
              canDiscounts ? adminDiscounts.data?.data : undefined,
              now,
            ),
        );
      case "sale-products":
        return fromSource(
          {
            allowed: canProducts,
            ...pick(saleProducts),
            data: saleProducts.data?.meta?.total,
          },
          (total) => ({ status: "ready", summary: c.saleProductsState(total) }),
        );
    }
  };

  const [tabId, setTabId] = useState<ContentMapTabId>("home");
  // The selected zone number on the open tab; a new tab starts unselected.
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <Tabs
        value={tabId}
        onValueChange={(value) => {
          setTabId(value as ContentMapTabId);
          setSelected(null);
        }}
      >
        <TabsList
          aria-label={c.tabsAria}
          className="w-full justify-start overflow-x-auto"
        >
          {CONTENT_MAP_TABS.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="flex-none gap-1.5"
            >
              {tab.label}
              <span className="inline-flex min-w-5 justify-center rounded-full bg-muted px-1.5 text-xs leading-4.5 text-foreground tabular-nums">
                {tab.zones.length}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
        {CONTENT_MAP_TABS.map((tab) => (
          <TabsContent key={tab.id} value={tab.id} className="pt-2">
            <ContentMapTabPanel
              tab={tab}
              selected={selected}
              onSelect={(zone) => {
                setSelected(zone);
                document
                  .getElementById(cardId(tab.id, zone))
                  ?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
              }}
              resolve={resolve}
            />
          </TabsContent>
        ))}
      </Tabs>

      <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        {c.catalogNote}
      </p>
    </div>
  );
}

const cardId = (tab: ContentMapTabId, zone: number) =>
  `content-map-${tab}-zone-${zone}`;

/** The query lifecycle flags a {@link Source} needs. */
function pick(query: { isLoading: boolean; isError: boolean }) {
  return { isLoading: query.isLoading, isError: query.isError };
}

function ContentMapTabPanel({
  tab,
  selected,
  onSelect,
  resolve,
}: {
  tab: ContentMapTab;
  selected: number | null;
  onSelect: (zone: number) => void;
  resolve: (source: ContentMapZoneSource) => ZoneState;
}) {
  // ДЩ3 — on a phone the schema folds behind one button; from md it stands.
  const [schemaOpen, setSchemaOpen] = useState(false);
  const schemaId = `content-map-${tab.id}-schema`;

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
      <div className="flex flex-col gap-2 md:w-75 md:shrink-0">
        <button
          type="button"
          aria-expanded={schemaOpen}
          aria-controls={schemaId}
          onClick={() => setSchemaOpen((open) => !open)}
          className="flex min-h-11 items-center justify-between rounded-lg border bg-card px-3 text-sm font-medium text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:hidden"
        >
          {schemaOpen ? c.schemaHide : c.schemaShow}
          <ChevronDownIcon
            aria-hidden="true"
            className={cn(
              "size-4 transition-transform motion-reduce:transition-none",
              schemaOpen && "rotate-180",
            )}
          />
        </button>
        <div
          id={schemaId}
          className={cn(
            schemaOpen ? "block" : "hidden",
            "md:sticky md:top-0 md:block",
          )}
        >
          <ContentMapSchema tab={tab} selected={selected} onSelect={onSelect} />
        </div>
      </div>

      <ol aria-label={tab.label} className="flex min-w-0 flex-1 flex-col gap-2">
        {tab.zones.map((entry, index) => {
          const zone = CONTENT_MAP_ZONE_BY_ID[entry.id];
          const number = index + 1;
          return (
            <ContentMapZoneCard
              key={entry.id}
              id={cardId(tab.id, number)}
              zone={zone}
              number={number}
              title={entry.title}
              appliesTo={entry.appliesTo}
              state={resolve(zone.source)}
              selected={selected === number}
              onSelect={() => onSelect(number)}
            />
          );
        })}
      </ol>
    </div>
  );
}
