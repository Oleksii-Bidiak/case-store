"use client";

import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
  /** Which products the rail lists: same category, or same device model. */
  filter: ProductRailFilter;
  /** Current product id — excluded from the rail. */
  excludeId: string;
}

const ARROW_CLASS =
  "grid size-10 shrink-0 place-items-center rounded-[11px] border-[1.5px] border-border bg-card text-foreground transition-colors hover:border-primary hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * ProductRail — a horizontal snap-scroll rail of up to eight other products,
 * with prev/next arrow controls. The PDP mounts it twice: «Сумісні аксесуари»
 * (same device model, TASK-190) and «Схожі товари» (same category).
 *
 * TASK-813: those used to be two copies of this file that differed only in the
 * query parameter and the heading — and so carried the same arrow labels, four
 * buttons with two pairs of identical names for a screen reader. The labels are
 * now built from the rail's title. Renders nothing when the query yields no
 * other products.
 */
export function ProductRail({
  title,
  headingId,
  filter,
  excludeId,
}: ProductRailProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Same builder the PDP route prefetches with (TASK-563) — one key, so the
  // server-rendered cards are adopted rather than re-fetched.
  const { data, isPending } = useProductControllerFindAll(
    buildProductRailParams(filter),
  );

  const scroll = (dir: -1 | 1) =>
    scrollRef.current?.scrollBy({ left: dir * 540, behavior: "smooth" });

  if (isPending) {
    return (
      <section aria-labelledby={headingId} className="flex flex-col gap-4">
        <h2 id={headingId} className={`${H2_CLASS} text-foreground`}>
          {title}
        </h2>
        <div className="flex gap-[18px] overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-[430px] w-[244px] shrink-0 rounded-2xl"
            />
          ))}
        </div>
      </section>
    );
  }

  const products = (data?.data ?? [])
    .filter((p) => p.id !== excludeId)
    .slice(0, 8);

  if (products.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-[18px]">
      <div className="flex items-center justify-between gap-3">
        <h2 id={headingId} className={`${H2_CLASS} text-foreground`}>
          {title}
        </h2>
        <div className="hidden gap-2.5 sm:flex">
          <button
            type="button"
            onClick={() => scroll(-1)}
            aria-label={dict.product.railPrev(title)}
            className={ARROW_CLASS}
          >
            <ChevronLeft className="size-[18px]" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => scroll(1)}
            aria-label={dict.product.railNext(title)}
            className={ARROW_CLASS}
          >
            <ChevronRight className="size-[18px]" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex snap-x snap-mandatory gap-[18px] overflow-x-auto pb-3.5 [scrollbar-width:thin]"
      >
        {products.map((product) => (
          <div key={product.id} className="w-[244px] shrink-0 snap-start">
            <ProductCard
              product={product}
              action={<ProductCardActions product={product} />}
              hoverAction={<ProductQuickViewTrigger product={product} />}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
