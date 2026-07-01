"use client";

import { useProductControllerFindAll } from "@/entities/product";
import { ProductCard, Skeleton } from "@/shared/ui";
import { ProductCardActions } from "@/widgets/product-card-actions";
import { dict } from "@/shared/config";

interface ProductRelatedProps {
  categoryId: string;
  /** Current product id — excluded from the related list. */
  excludeId: string;
}

/**
 * ProductRelated — a row of up to four other products from the same category.
 * Uses the existing product list hook (no new endpoint). Renders nothing when
 * there are no other products to show.
 */
export function ProductRelated({ categoryId, excludeId }: ProductRelatedProps) {
  const { data, isPending } = useProductControllerFindAll({
    categoryId,
    isActive: true,
    page: 1,
    limit: 5,
    sortBy: "createdAt",
    sortOrder: "desc",
  });

  if (isPending) {
    return (
      <section
        aria-labelledby="related-heading"
        className="flex flex-col gap-4"
      >
        <h2 id="related-heading" className="text-xl font-bold text-foreground">
          {dict.product.relatedTitle}
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[3/4] w-full rounded-lg" />
          ))}
        </div>
      </section>
    );
  }

  const related = (data?.data ?? [])
    .filter((p) => p.id !== excludeId)
    .slice(0, 4);

  if (related.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="related-heading" className="flex flex-col gap-4">
      <h2 id="related-heading" className="text-xl font-bold text-foreground">
        {dict.product.relatedTitle}
      </h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {related.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            action={<ProductCardActions product={product} />}
          />
        ))}
      </div>
    </section>
  );
}
