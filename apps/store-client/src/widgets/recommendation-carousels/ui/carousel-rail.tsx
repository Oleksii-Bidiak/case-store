"use client";

import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { PublicCarouselEntity } from "@/shared/api/generated/models";
import { ProductCard } from "@/shared/ui";
import { ProductCardActions } from "@/widgets/product-card-actions";
import { dict } from "@/shared/config";

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
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const headingId = `carousel-heading-${carousel.id}`;

  function scroll(direction: 1 | -1) {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: "smooth" });
  }

  return (
    <section
      aria-labelledby={headingId}
      className="mx-auto w-full max-w-7xl px-4"
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-border">
        <h2
          id={headingId}
          // eslint-disable-next-line tailwindcss/no-arbitrary-value -- matches PopularRail's rail-heading size exactly (28px has no token)
          className="pb-3 font-display text-2xl font-bold tracking-tight text-foreground sm:text-[28px]"
        >
          {carousel.title}
        </h2>

        <div className="flex items-center gap-2.5 pb-3">
          <button
            type="button"
            onClick={() => scroll(-1)}
            aria-label={dict.carousels.prevAria}
            className="hidden size-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:border-primary hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => scroll(1)}
            aria-label={dict.carousels.nextAria}
            className="hidden size-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:border-primary hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
      </div>

      <div
        ref={scrollerRef}
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
            />
          </div>
        ))}
      </div>
    </section>
  );
}
