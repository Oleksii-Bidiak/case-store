"use client";

import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useProductControllerFindAll } from "@/entities/product";
import { ProductCard, Skeleton } from "@/shared/ui";
import { ProductCardActions } from "@/widgets/product-card-actions";
import { dict } from "@/shared/config";

interface ProductRelatedProps {
  categoryId: string;
  /** Current product id — excluded from the related list. */
  excludeId: string;
}

const ARROW_CLASS =
  "grid size-10 shrink-0 place-items-center rounded-[11px] border-[1.5px] border-border bg-card text-foreground transition-colors hover:border-primary hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * ProductRelated — a horizontal snap-scroll rail of up to eight other products
 * from the same category, with prev/next arrow controls (design import). Uses
 * the existing product list hook (no new endpoint). Renders nothing when there
 * are no other products to show.
 */
export function ProductRelated({ categoryId, excludeId }: ProductRelatedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data, isPending } = useProductControllerFindAll({
    categoryId,
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
        aria-labelledby="related-heading"
        className="flex flex-col gap-4"
      >
        <h2
          id="related-heading"
          className="font-display text-[22px] font-bold tracking-tight text-foreground"
        >
          {dict.product.relatedTitle}
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

  const related = (data?.data ?? [])
    .filter((p) => p.id !== excludeId)
    .slice(0, 8);

  if (related.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="related-heading"
      className="flex flex-col gap-[18px]"
    >
      <div className="flex items-center justify-between gap-3">
        <h2
          id="related-heading"
          className="font-display text-[22px] font-bold tracking-tight text-foreground"
        >
          {dict.product.relatedTitle}
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
        {related.map((product) => (
          <div key={product.id} className="w-[244px] shrink-0 snap-start">
            <ProductCard
              product={product}
              action={<ProductCardActions product={product} />}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
