"use client";

import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useProductControllerFindAll } from "@/entities/product";
import { ProductCard, Skeleton } from "@/shared/ui";
import { ProductCardActions } from "@/widgets/product-card-actions";
import { ProductQuickViewTrigger } from "@/widgets/product-quick-view";
import { dict } from "@/shared/config";

interface ProductCompatibleProps {
  /** A device model the current product is compatible with (drives the query). */
  deviceModelId: string;
  /** Current product id — excluded from the cross-sell list. */
  excludeId: string;
}

const ARROW_CLASS =
  "grid size-10 shrink-0 place-items-center rounded-[11px] border-[1.5px] border-border bg-card text-foreground transition-colors hover:border-primary hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * ProductCompatible — the PDP "Сумісні аксесуари" cross-sell rail (TASK-190):
 * other products compatible with the same device model as the current one.
 * Mirrors {@link ProductRelated}'s snap-scroll/arrow shell but filters by
 * `deviceModelId` instead of category. Renders nothing while loading yields no
 * other products (the parent only mounts it when the product has ≥1 compat
 * model).
 */
export function ProductCompatible({
  deviceModelId,
  excludeId,
}: ProductCompatibleProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data, isPending } = useProductControllerFindAll({
    deviceModelId,
    isActive: true,
    page: 1,
    limit: 9,
    sortBy: "createdAt",
    sortOrder: "desc",
  });

  const scroll = (dir: -1 | 1) =>
    scrollRef.current?.scrollBy({ left: dir * 540, behavior: "smooth" });

  if (isPending) {
    return (
      <section
        aria-labelledby="compatible-heading"
        className="flex flex-col gap-4"
      >
        <h2
          id="compatible-heading"
          className="font-display text-[22px] font-bold tracking-tight text-foreground"
        >
          {dict.product.compatibleTitle}
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

  const compatible = (data?.data ?? [])
    .filter((p) => p.id !== excludeId)
    .slice(0, 8);

  if (compatible.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="compatible-heading"
      className="flex flex-col gap-[18px]"
    >
      <div className="flex items-center justify-between gap-3">
        <h2
          id="compatible-heading"
          className="font-display text-[22px] font-bold tracking-tight text-foreground"
        >
          {dict.product.compatibleTitle}
        </h2>
        <div className="hidden gap-2.5 sm:flex">
          <button
            type="button"
            onClick={() => scroll(-1)}
            aria-label={dict.product.relatedPrev}
            className={ARROW_CLASS}
          >
            <ChevronLeft className="size-[18px]" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => scroll(1)}
            aria-label={dict.product.relatedNext}
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
        {compatible.map((product) => (
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
