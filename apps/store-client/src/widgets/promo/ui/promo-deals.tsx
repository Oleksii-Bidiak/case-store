"use client";

import { useState } from "react";
import { useProductControllerFindAll } from "@/entities/product";
import { useCategoryControllerGetRootCategories } from "@/entities/category";
import { ProductCard, Skeleton } from "@/shared/ui";
import { ProductCardActions } from "@/widgets/product-card-actions";
import { dict } from "@/shared/config";

/** A product is "on sale" when its compare-at price is above the live price. */
function isOnSale(product: { price: string; compareAtPrice?: string | null }) {
  return (
    product.compareAtPrice != null &&
    Number(product.compareAtPrice) > Number(product.price)
  );
}

const TAB_BASE =
  "h-[38px] rounded-[10px] border px-4 text-[13.5px] font-semibold transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * PromoDeals — the "Товари зі знижкою" section: real root categories as filter
 * tabs over the live product listing, client-filtered to on-sale positions
 * (the API has no server-side on-sale filter yet — same pattern as the homepage
 * PopularRail; a real filter is TASK-179). Cards reuse the shared ProductCard +
 * ProductCardActions (real add-to-cart / wishlist).
 */
export function PromoDeals() {
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const { data: catData } = useCategoryControllerGetRootCategories({
    isActive: true,
    sortBy: "sortOrder",
    sortOrder: "asc",
  });
  const categories = catData?.data ?? [];

  const { data, isPending, isError } = useProductControllerFindAll({
    isActive: true,
    limit: 48,
    sortBy: "createdAt",
    sortOrder: "desc",
    ...(categoryId ? { categoryId } : {}),
  });

  const deals = (data?.data ?? []).filter(isOnSale);

  return (
    <section id="deals" className="mt-10 scroll-mt-24">
      <div className="mb-[18px] flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">
          {dict.promo.dealsHeading}
        </h2>
        <div
          role="group"
          aria-label={dict.promo.dealsFilterAria}
          className="flex flex-wrap gap-2"
        >
          <button
            type="button"
            aria-pressed={categoryId === null}
            onClick={() => setCategoryId(null)}
            className={`${TAB_BASE} ${
              categoryId === null
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground hover:border-primary"
            }`}
          >
            {dict.promo.dealsAll}
          </button>
          {categories.map((category) => {
            const active = category.id === categoryId;
            return (
              <button
                key={category.id}
                type="button"
                aria-pressed={active}
                onClick={() => setCategoryId(category.id)}
                className={`${TAB_BASE} ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:border-primary"
                }`}
              >
                {category.name}
              </button>
            );
          })}
        </div>
      </div>

      {isPending ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(232px,1fr))] gap-[18px]">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[430px] w-full rounded-2xl" />
          ))}
        </div>
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          {dict.promo.dealsError}
        </p>
      ) : deals.length === 0 ? (
        <p className="text-sm text-muted-foreground">{dict.promo.dealsEmpty}</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(232px,1fr))] gap-[18px]">
          {deals.map((product, index) => (
            <ProductCard
              key={product.id}
              product={product}
              priority={index < 4}
              action={<ProductCardActions product={product} />}
            />
          ))}
        </div>
      )}
    </section>
  );
}
