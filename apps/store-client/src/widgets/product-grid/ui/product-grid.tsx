"use client";

import { useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  useProductControllerFindAll,
  type ProductControllerFindAllParams,
} from "@/entities/product";
import type {
  PublicCarouselEntity,
  PublicProductEntity,
} from "@/shared/api/generated/models";
import { ProductCard } from "@/shared/ui";
import { ProductCardActions } from "@/widgets/product-card-actions";
import { ProductQuickViewTrigger } from "@/widgets/product-quick-view";
import { dict } from "@/shared/config";
import { PopularRailSkeleton } from "./product-grid-skeleton";

/**
 * Fallback tabs — used ONLY when no HOME_TABS carousel is available (fresh
 * install, everything unpublished, or an unreachable API, which yields an empty
 * list by design). Each is backed by a real server-side filter:
 *   • hits → bestselling: units sold across PAID orders, most sold first (TASK-164)
 *   • new  → newest first (createdAt desc)
 *   • sale → `onSale: true` — the discounted set is computed by the API, NOT by
 *            filtering a page client-side (which used to leave the tab looking
 *            empty whenever the first page held few discounted items).
 */
const FALLBACK_TABS: QueryTab[] = [
  {
    key: "hits",
    label: dict.home.popular.tabs.hits,
    params: {
      isActive: true,
      sortBy: "bestselling",
      sortOrder: "desc",
      limit: 12,
    },
  },
  {
    key: "new",
    label: dict.home.popular.tabs.new,
    params: {
      isActive: true,
      sortBy: "createdAt",
      sortOrder: "desc",
      limit: 12,
    },
  },
  {
    key: "sale",
    label: dict.home.popular.tabs.sale,
    params: { isActive: true, onSale: true, limit: 12 },
  },
];

/** Rail slides are fixed-width (`w-[244px] sm:w-[260px]`), not grid-fluid. */
const RAIL_IMAGE_SIZES = "(max-width: 639px) 244px, 260px";

/** A tab whose products were resolved server-side (an admin HOME_TABS carousel). */
interface CarouselTab {
  key: string;
  label: string;
  products: PublicProductEntity[];
}

/** A tab that fetches its own products client-side (fallback mode only). */
interface QueryTab {
  key: string;
  label: string;
  params: ProductControllerFindAllParams;
}

type RailTab = CarouselTab | QueryTab;

function isCarouselTab(tab: RailTab): tab is CarouselTab {
  return "products" in tab;
}

/**
 * Admin-managed HOME_TABS carousels become the tabs (title = tab label, resolved
 * products = tab content). A carousel that resolved to zero products is dropped —
 * a tab that opens onto nothing is worse than no tab.
 */
function toTabs(carousels: PublicCarouselEntity[]): RailTab[] {
  const tabs: CarouselTab[] = carousels
    .filter((carousel) => carousel.products.length > 0)
    .map((carousel) => ({
      key: carousel.id,
      label: carousel.title,
      products: carousel.products,
    }));

  // Fallback (never an empty hole on the homepage): with no usable carousel the
  // rail behaves exactly as it did before TASK-288. The section carries the
  // homepage's product discovery, and `fetchPublishedCarousels` returns [] on any
  // transport error — hiding the section would mean a brief API outage silently
  // guts the homepage. Same posture as the banner regions falling back to their
  // hardcoded content.
  return tabs.length > 0 ? tabs : FALLBACK_TABS;
}

/**
 * PopularRail — the homepage "Популярне" section: a tabbed, horizontally
 * scrollable product rail. Tabs come from the published HOME_TABS carousels
 * (TASK-288), fetched server-side and passed in already resolved; only the
 * fallback tabs still query the product list themselves. Client Component (tab
 * state + scroll arrows).
 */
export function PopularRail({
  carousels = [],
}: {
  /** Published HOME_TABS carousels, ordered by sortOrder (from the server page). */
  carousels?: PublicCarouselEntity[];
}) {
  const tabs = toTabs(carousels);
  const [selectedKey, setSelectedKey] = useState(tabs[0].key);
  // Render-time guard instead of seeding state again from the (async) prop: if
  // the admin unpublishes the carousel behind the selected tab, its key no longer
  // exists and we fall back to the first tab rather than rendering nothing.
  const active = tabs.find((tab) => tab.key === selectedKey) ?? tabs[0];

  // Points at the active tab's scroll container. Only the active rail is
  // mounted, so this ref always tracks the visible one.
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  function scroll(direction: 1 | -1) {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: "smooth" });
  }

  return (
    <section
      aria-labelledby="popular-heading"
      className="mx-auto w-full max-w-7xl px-4"
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-border">
        <div className="flex flex-wrap items-end gap-x-7 gap-y-1">
          <h2
            id="popular-heading"
            className="pb-3 font-display text-2xl font-bold tracking-tight text-foreground sm:text-[28px]"
          >
            {dict.home.popular.heading}
          </h2>
          <div
            role="tablist"
            aria-label={dict.home.popular.tabsAria}
            className="flex flex-wrap gap-x-7 gap-y-1"
          >
            {tabs.map(({ key, label }) => {
              const isActive = key === active.key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setSelectedKey(key)}
                  className={`px-0.5 py-3.5 font-display text-base font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    isActive
                      ? // eslint-disable-next-line tailwindcss/no-arbitrary-value -- one-off inset active-tab underline, not a reusable elevation token
                        "text-foreground shadow-[inset_0_-2px_0_0_var(--color-primary)]"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2.5 pb-3">
          <button
            type="button"
            onClick={() => scroll(-1)}
            aria-label={dict.home.popular.prev}
            className="hidden size-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:border-primary hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => scroll(1)}
            aria-label={dict.home.popular.next}
            className="hidden size-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:border-primary hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex"
          >
            <ChevronRight className="size-5" />
          </button>
          <Link
            href="/products"
            className="ml-1.5 text-sm font-semibold text-primary hover:underline"
          >
            {dict.home.popular.viewAll} →
          </Link>
        </div>
      </div>

      {isCarouselTab(active) ? (
        <RailSlides
          key={active.key}
          products={active.products}
          scrollerRef={scrollerRef}
        />
      ) : (
        <QueryRail
          key={active.key}
          params={active.params}
          scrollerRef={scrollerRef}
        />
      )}
    </section>
  );
}

/** Fallback-only rail: fetches its own page of products (loading/error states). */
function QueryRail({
  params,
  scrollerRef,
}: {
  params: ProductControllerFindAllParams;
  scrollerRef: RefObject<HTMLDivElement | null>;
}) {
  const { data, isPending, isError } = useProductControllerFindAll(params);

  if (isPending) return <PopularRailSkeleton />;

  if (isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {dict.home.popular.error}
      </p>
    );
  }

  const products = data?.data ?? [];
  if (products.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{dict.home.popular.empty}</p>
    );
  }

  return <RailSlides products={products} scrollerRef={scrollerRef} />;
}

function RailSlides({
  products,
  scrollerRef,
}: {
  products: PublicProductEntity[];
  scrollerRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={scrollerRef}
      className="flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth pb-3"
    >
      {products.map((product) => (
        <div
          key={product.id}
          className="w-[244px] shrink-0 snap-start sm:w-[260px]"
        >
          {/* No `priority`: the rail sits below the hero (the homepage LCP),
              so head-preloading its first slides only competed with the hero
              and forced eager downloads (TASK-210). Slides lazy-load, and
              `imageSizes` matches the fixed slide width above. */}
          <ProductCard
            product={product}
            imageSizes={RAIL_IMAGE_SIZES}
            action={<ProductCardActions product={product} />}
            hoverAction={<ProductQuickViewTrigger product={product} />}
          />
        </div>
      ))}
    </div>
  );
}
