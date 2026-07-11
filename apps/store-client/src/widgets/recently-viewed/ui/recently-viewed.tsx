"use client";

import { useRef, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useProductControllerGetCards } from "@/entities/product";
import { ProductCard, Skeleton } from "@/shared/ui";
import { ProductCardActions } from "@/widgets/product-card-actions";
import { ProductQuickViewTrigger } from "@/widgets/product-quick-view";
import { dict } from "@/shared/config";
import {
  subscribeRecentlyViewed,
  getRecentlyViewedSnapshot,
  getRecentlyViewedServerSnapshot,
  clearRecentlyViewed,
} from "../model/recently-viewed-storage";

/** Rail slides are fixed-width (`w-[244px] sm:w-[260px]`), not grid-fluid. */
const RAIL_IMAGE_SIZES = "(max-width: 639px) 244px, 260px";

/**
 * RecentlyViewed — the homepage «Ви переглядали» rail. localStorage keeps only
 * the visited product ids (most-recent-first); this widget hydrates them into
 * fresh `PublicProductEntity` cards via the Orval `GET /products/cards` hook,
 * so prices, stock, and images are always live (TASK-211). Rendering reuses
 * the PopularRail composition: the shared `ProductCard` with injected
 * `ProductCardActions`, in a horizontally snap-scrolling rail with header
 * arrows. Renders nothing until there is history (the homepage never shows an
 * empty section). Client Component.
 */
export function RecentlyViewed() {
  // useSyncExternalStore keeps the server snapshot ([]) and the client
  // localStorage snapshot in sync without a setState-in-effect, so there is no
  // hydration mismatch. clearRecentlyViewed() notifies the store to re-render.
  const items = useSyncExternalStore(
    subscribeRecentlyViewed,
    getRecentlyViewedSnapshot,
    getRecentlyViewedServerSnapshot,
  );
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const ids = items.map((item) => item.id);
  const { data, isPending, isError } = useProductControllerGetCards(
    { ids: ids.join(",") },
    // Never fire with an empty history (also covers SSR / first client render,
    // where the store snapshot is the stable empty array).
    { query: { enabled: ids.length > 0 } },
  );

  if (ids.length === 0) return null;

  // The stored history is the source of truth for ordering (most recent
  // first); the API also preserves request order, but re-mapping here keeps
  // the rail correct even against a reordered cached response. Ids the server
  // dropped (deactivated/deleted products) vanish silently.
  const byId = new Map((data?.data ?? []).map((p) => [p.id, p]));
  const products = ids.flatMap((id) => {
    const product = byId.get(id);
    return product ? [product] : [];
  });

  // Whole history went stale server-side — hide the section entirely.
  if (!isPending && !isError && products.length === 0) return null;

  function scroll(direction: 1 | -1) {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: "smooth" });
  }

  return (
    <section
      aria-labelledby="recently-viewed-heading"
      className="mx-auto w-full max-w-7xl px-4"
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h2
          id="recently-viewed-heading"
          className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
        >
          {dict.home.recentlyViewed.heading}
        </h2>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={clearRecentlyViewed}
            className="text-sm font-semibold text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {dict.home.recentlyViewed.clear}
          </button>
          <button
            type="button"
            onClick={() => scroll(-1)}
            aria-label={dict.home.recentlyViewed.prev}
            className="hidden size-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:border-primary hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => scroll(1)}
            aria-label={dict.home.recentlyViewed.next}
            className="hidden size-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:border-primary hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
      </div>

      {isPending ? (
        <RecentlyViewedSkeleton />
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          {dict.home.recentlyViewed.error}
        </p>
      ) : (
        <div
          ref={scrollerRef}
          className="flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth pb-3"
        >
          {products.map((product) => (
            <div
              key={product.id}
              className="w-[244px] shrink-0 snap-start sm:w-[260px]"
            >
              {/* No `priority`: the rail sits at the bottom of the homepage,
                  far below the LCP — slides lazy-load (TASK-210 semantics). */}
              <ProductCard
                product={product}
                imageSizes={RAIL_IMAGE_SIZES}
                action={<ProductCardActions product={product} />}
                hoverAction={<ProductQuickViewTrigger product={product} />}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** Loading fallback while the stored ids hydrate into fresh cards. */
function RecentlyViewedSkeleton() {
  return (
    <div className="flex gap-5 overflow-hidden pb-3" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex w-[244px] shrink-0 flex-col gap-2 sm:w-[260px]"
        >
          <Skeleton className="aspect-square w-full rounded-xl" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      ))}
    </div>
  );
}
