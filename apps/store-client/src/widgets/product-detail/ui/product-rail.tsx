"use client";

import { useRef, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { useProductControllerFindAll } from "@/entities/product";
import { ProductCard, Skeleton } from "@/shared/ui";
import { ProductCardActions } from "@/widgets/product-card-actions";
import { ProductQuickViewTrigger } from "@/widgets/product-quick-view";
import { dict, H2_CLASS } from "@/shared/config";
import {
  buildProductRailParams,
  type ProductRailFilter,
} from "../model/rail-params";

interface ProductRailProps {
  /** Visible heading; also names the arrow buttons. */
  title: string;
  /** Id of the heading element — unique per rail on the page. */
  headingId: string;
  /** A short line above the title («Для вашого пристрою»). */
  kicker?: ReactNode;
  /** The «see all» link beside the title («Все для iPhone 15 Pro →»). */
  more?: { href: string; label: string };
  /** Which products the rail lists: same category, or same device model. */
  filter: ProductRailFilter;
  /** Current product id — excluded from the rail. */
  excludeId: string;
}

const ARROW_CLASS =
  "grid size-10 shrink-0 place-items-center rounded-full border-chip border-border bg-card text-foreground transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none";

/** 2 cards on a phone, 3 from md, 4 from lg, 5 from xl — the slides' widths. */
const RAIL_IMAGE_SIZES =
  "(max-width: 767px) 50vw, (max-width: 1023px) 33vw, (max-width: 1279px) 25vw, 240px";

/*
 * The rail bleeds to the screen edge below md (the half-clipped card says
 * "scrolls"). The gap is each slide's right padding, cancelled by the rail's
 * negative right margin, so slide widths stay plain fractions — the device
 * hub's rail does the same.
 */
const TRACK_CLASS =
  "-mx-4 flex snap-x snap-mandatory scroll-pl-4 overflow-x-auto pt-1 pb-4 pl-4 pr-1 scrollbar-none sm:-mx-6 sm:scroll-pl-6 sm:pl-6 sm:pr-3 md:ml-0 md:-mr-4 md:scroll-pl-0 md:pl-0 md:pr-0";
const SLIDE_CLASS =
  "w-1/2 shrink-0 snap-start pr-3 md:w-1/3 md:pr-4 lg:w-1/4 xl:w-1/5";

/**
 * ProductRail — a horizontal snap-scroll rail of up to eight other IN-STOCK
 * products (Product mockup §6.9: the rails sell, so nothing sold out), with
 * an optional kicker, a «see all» link and prev/next arrows. The PDP mounts
 * it twice: the device rail («Ще для …») and the category rail.
 *
 * TASK-813: the arrow labels are built from the rail's title, so two rails on
 * one page never carry identical button names. Renders nothing when the query
 * yields no other products.
 */
export function ProductRail({
  title,
  headingId,
  kicker,
  more,
  filter,
  excludeId,
}: ProductRailProps) {
  const scrollRef = useRef<HTMLUListElement>(null);

  // Same builder the PDP route prefetches with (TASK-563) — one key, so the
  // server-rendered cards are adopted rather than re-fetched.
  const { data, isPending } = useProductControllerFindAll(
    buildProductRailParams(filter),
  );

  const scroll = (dir: -1 | 1) => {
    const track = scrollRef.current;
    track?.scrollBy({
      left: dir * track.clientWidth * 0.8,
      behavior: "smooth",
    });
  };

  const header = (withControls: boolean) => (
    <div className="flex items-end justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        {kicker && (
          <p className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            {kicker}
          </p>
        )}
        <h2 id={headingId} className={`${H2_CLASS} text-foreground`}>
          {title}
        </h2>
      </div>
      {withControls && (
        <div className="flex shrink-0 items-center gap-2.5">
          {more && (
            <Link
              href={more.href}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-sm text-sm font-semibold text-foreground underline-offset-3 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {more.label}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          )}
          <button
            type="button"
            onClick={() => scroll(-1)}
            aria-label={dict.product.railPrev(title)}
            className={`hidden sm:grid ${ARROW_CLASS}`}
          >
            <ChevronLeft className="size-4.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => scroll(1)}
            aria-label={dict.product.railNext(title)}
            className={`hidden sm:grid ${ARROW_CLASS}`}
          >
            <ChevronRight className="size-4.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );

  if (isPending) {
    return (
      <section aria-labelledby={headingId} className="flex flex-col gap-4">
        {header(false)}
        <div className={`${TRACK_CLASS} overflow-hidden`}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={SLIDE_CLASS}>
              <Skeleton className="aspect-3/5 w-full rounded-card" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  const products = (data?.data ?? [])
    .filter((p) => p.id !== excludeId && p.inStock)
    .slice(0, 8);

  if (products.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      {header(true)}
      <ul ref={scrollRef} className={TRACK_CLASS}>
        {products.map((product) => (
          <li key={product.id} className={SLIDE_CLASS}>
            <ProductCard
              product={product}
              imageSizes={RAIL_IMAGE_SIZES}
              action={<ProductCardActions product={product} />}
              hoverAction={<ProductQuickViewTrigger product={product} />}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
