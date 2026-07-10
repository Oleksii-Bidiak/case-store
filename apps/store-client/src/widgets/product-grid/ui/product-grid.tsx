"use client";

import { useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  useProductControllerFindAll,
  type ProductControllerFindAllParams,
} from "@/entities/product";
import { ProductCard } from "@/shared/ui";
import { ProductCardActions } from "@/widgets/product-card-actions";
import { dict } from "@/shared/config";
import { PopularRailSkeleton } from "./product-grid-skeleton";

type TabKey = "hits" | "new" | "sale";

// Query params per tab, each backed by a real filter:
//   • hits → bestselling: units sold across PAID orders, most sold first (TASK-164)
//   • new  → newest first (createdAt desc)
//   • sale → fetch a wider page, then client-filter to items on sale
const TAB_PARAMS: Record<TabKey, ProductControllerFindAllParams> = {
  hits: { isActive: true, sortBy: "bestselling", sortOrder: "desc", limit: 12 },
  new: { isActive: true, sortBy: "createdAt", sortOrder: "desc", limit: 12 },
  sale: { isActive: true, limit: 24 },
};

const TABS: { key: TabKey; label: string }[] = [
  { key: "hits", label: dict.home.popular.tabs.hits },
  { key: "new", label: dict.home.popular.tabs.new },
  { key: "sale", label: dict.home.popular.tabs.sale },
];

/** Rail slides are fixed-width (`w-[244px] sm:w-[260px]`), not grid-fluid. */
const RAIL_IMAGE_SIZES = "(max-width: 639px) 244px, 260px";

function isOnSale(product: { price: string; compareAtPrice?: string | null }) {
  return (
    product.compareAtPrice != null &&
    Number(product.compareAtPrice) > Number(product.price)
  );
}

/**
 * PopularRail — the homepage "Популярне" section: a tabbed, horizontally
 * scrollable product rail (Хіти / Новинки / Акційні). Each tab mounts its own
 * query; header arrows scroll whichever rail is active. Client Component.
 */
export function PopularRail() {
  const [tab, setTab] = useState<TabKey>("hits");
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
            {TABS.map(({ key, label }) => {
              const active = key === tab;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(key)}
                  className={`px-0.5 py-3.5 font-display text-base font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    active
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

      <RailContent
        key={tab}
        params={TAB_PARAMS[tab]}
        onlyOnSale={tab === "sale"}
        scrollerRef={scrollerRef}
      />
    </section>
  );
}

function RailContent({
  params,
  onlyOnSale,
  scrollerRef,
}: {
  params: ProductControllerFindAllParams;
  onlyOnSale: boolean;
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

  const all = data?.data ?? [];
  const products = onlyOnSale ? all.filter(isOnSale) : all;

  if (products.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{dict.home.popular.empty}</p>
    );
  }

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
          />
        </div>
      ))}
    </div>
  );
}
