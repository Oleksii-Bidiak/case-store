"use client";

import { useId, useState, type Ref } from "react";
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
import {
  dict,
  FOCUS_RING,
  H2_CLASS,
  LINK,
  PAGE_CONTAINER,
  RAIL_ARROW,
} from "@/shared/config";
import { useScrollEdges } from "@/shared/lib/use-scroll-edges";
import { cn } from "@/shared/lib/utils";
import { isCarouselTab, toTabs } from "../model/popular-tabs";
import { PopularRailSkeleton } from "./product-grid-skeleton";

/** Rail slides are fixed-width (`w-[244px] sm:w-[260px]`), not grid-fluid. */
const RAIL_IMAGE_SIZES = "(max-width: 639px) 244px, 260px";

/**
 * PopularRail — one homepage TABS block (TASK-663; «Популярне» by default): a
 * tabbed, horizontally scrollable product rail. Tabs are the block's published
 * carousels (TASK-288), fetched server-side and passed in already resolved; only
 * the fallback tabs still query the product list themselves. The page may hold
 * several TABS blocks, so the heading is the block's own title and the heading
 * id is per instance. Client Component (tab state + scroll arrows).
 */
export function PopularRail({
  carousels = [],
  title,
}: {
  /** The block's published tab carousels, in tab order (from the server page). */
  carousels?: PublicCarouselEntity[];
  /** The block's heading; blank or absent → the default «Популярне». */
  title?: string | null;
}) {
  const heading = title?.trim() || dict.home.popular.heading;
  const headingId = useId();
  const tabs = toTabs(carousels);
  const [selectedKey, setSelectedKey] = useState(tabs[0].key);
  // Render-time guard instead of seeding state again from the (async) prop: if
  // the admin unpublishes the carousel behind the selected tab, its key no longer
  // exists and we fall back to the first tab rather than rendering nothing.
  const active = tabs.find((tab) => tab.key === selectedKey) ?? tabs[0];

  // Points at the active tab's scroll container. Only the active rail is
  // mounted, so this callback ref always tracks the visible one — and the
  // arrows re-measure their edges after a tab switch (TASK-2079).
  const { setScroller, atStart, atEnd, scrollByPage } = useScrollEdges();

  return (
    <section aria-labelledby={headingId} className={PAGE_CONTAINER}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-border">
        <div className="flex flex-wrap items-end gap-x-7 gap-y-1">
          <h2 id={headingId} className={`pb-3 ${H2_CLASS} text-foreground`}>
            {heading}
          </h2>
          <div
            role="tablist"
            aria-label={dict.home.popular.tabsAriaFor(heading)}
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
                  className={`rounded-sm px-0.5 py-3.5 font-display text-base font-semibold transition-interactive active:opacity-75 ${FOCUS_RING} ${
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
            onClick={() => scrollByPage(-1)}
            disabled={atStart}
            aria-label={dict.home.popular.prev}
            className={RAIL_ARROW}
          >
            <ChevronLeft aria-hidden="true" className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => scrollByPage(1)}
            disabled={atEnd}
            aria-label={dict.home.popular.next}
            className={RAIL_ARROW}
          >
            <ChevronRight aria-hidden="true" className="size-5" />
          </button>
          <Link
            href="/products"
            className={cn("ml-1.5 text-sm", LINK, FOCUS_RING)}
          >
            {dict.home.popular.viewAll} →
          </Link>
        </div>
      </div>

      {isCarouselTab(active) ? (
        <RailSlides
          key={active.key}
          products={active.products}
          scrollerRef={setScroller}
        />
      ) : (
        <QueryRail
          key={active.key}
          params={active.params}
          scrollerRef={setScroller}
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
  scrollerRef: Ref<HTMLDivElement>;
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
  scrollerRef: Ref<HTMLDivElement>;
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
