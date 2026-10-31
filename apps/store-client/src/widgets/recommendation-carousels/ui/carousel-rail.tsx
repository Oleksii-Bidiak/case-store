"use client";

import { useId } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { PublicCarouselEntity } from "@/shared/api/generated/models";
import { ProductCard } from "@/shared/ui";
import { ProductCardActions } from "@/widgets/product-card-actions";
import { ProductQuickViewTrigger } from "@/widgets/product-quick-view";
import { dict, H2_CLASS, PAGE_CONTAINER, RAIL_ARROW } from "@/shared/config";
import { useScrollEdges } from "@/shared/lib/use-scroll-edges";

/** Rail slides are fixed-width (`w-[244px] sm:w-[260px]`), not grid-fluid.
 *  Own copy per rail widget (PopularRail/RecentlyViewed do the same) — copied,
 *  not imported cross-widget, per the existing convention. */
const RAIL_IMAGE_SIZES = "(max-width: 639px) 244px, 260px";

interface CarouselRailProps {
  carousel: PublicCarouselEntity;
}

/**
 * CarouselRail — one admin-managed recommendation carousel (TASK-139):
 * structurally a de-tabbed PopularRail. The heading is the admin-authored
 * `carousel.title` (data, not a dictionary string — the one meaningful
 * difference from PopularRail's hardcoded heading); products arrive already
 * resolved from the server, so there is no query, no loading state, and no
 * empty state here (the parent filters empty carousels out). Client Component
 * for the scroll-arrow interactivity only.
 */
export function CarouselRail({ carousel }: CarouselRailProps) {
  // Arrows grey out at the row's ends (TASK-2079).
  const { setScroller, atStart, atEnd, scrollByPage } = useScrollEdges();
  // Per instance, not per carousel: the same carousel may stand in two
  // CAROUSEL blocks of the homepage (TASK-663), and ids must stay unique.
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className={PAGE_CONTAINER}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-border">
        <h2 id={headingId} className={`pb-3 ${H2_CLASS} text-foreground`}>
          {carousel.title}
        </h2>

        <div className="flex items-center gap-2.5 pb-3">
          <button
            type="button"
            onClick={() => scrollByPage(-1)}
            disabled={atStart}
            aria-label={dict.carousels.prevAria}
            className={RAIL_ARROW}
          >
            <ChevronLeft aria-hidden="true" className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => scrollByPage(1)}
            disabled={atEnd}
            aria-label={dict.carousels.nextAria}
            className={RAIL_ARROW}
          >
            <ChevronRight aria-hidden="true" className="size-5" />
          </button>
        </div>
      </div>

      <div
        ref={setScroller}
        className="flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth pb-3"
      >
        {carousel.products.map((product) => (
          <div
            key={product.id}
            // eslint-disable-next-line tailwindcss/no-arbitrary-value -- the shared fixed rail-slide width (PopularRail/RecentlyViewed use the same 244/260px)
            className="w-[244px] shrink-0 snap-start sm:w-[260px]"
          >
            {/* No `priority`: like PopularRail, this rail sits below the hero
                (the homepage LCP) — slides lazy-load, and `imageSizes` matches
                the fixed slide width above. */}
            <ProductCard
              product={product}
              imageSizes={RAIL_IMAGE_SIZES}
              action={<ProductCardActions product={product} />}
              hoverAction={<ProductQuickViewTrigger product={product} />}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
