"use client";

import { AddToCartButton } from "@/features/add-to-cart";
import { WishlistToggleButton } from "@/features/toggle-wishlist";
import type { PublicProductEntity } from "@/shared/api/generated/models";
import { dict } from "@/shared/config";

/**
 * ProductCardActions — the product-card footer from the design import: a small
 * availability line, then a "Купити" primary button (grows) next to an icon-only
 * wishlist heart. Passed to `<ProductCard action=…>` so `shared/ui` stays free of
 * feature imports; the heart lives here (in the footer), not floating on the image.
 */
export function ProductCardActions({
  product,
}: {
  product: PublicProductEntity;
}) {
  // Every card is ONE first-class position (TASK-142), so quick-add must target
  // THIS product and reflect ITS availability. `variantSummary.defaultVariantId`
  // / `defaultInStock` describe the group's CHEAPEST sibling — using them here
  // made «Купити» on a costlier sibling add the cheapest one instead (TASK-233,
  // the cart-side twin of the TASK-199 advertised-price fix).
  const inStock = product.inStock;

  return (
    <div className="flex flex-col gap-2">
      <p
        className={`flex items-center gap-1.5 text-xs ${
          inStock ? "text-success" : "text-muted-foreground"
        }`}
      >
        <span aria-hidden="true" className="text-[10px] leading-none">
          ●
        </span>
        {inStock
          ? dict.productCard.inStockLine
          : dict.productCard.outOfStockLine}
      </p>
      <div className="flex gap-2">
        <AddToCartButton
          productId={product.id}
          compact
          outOfStock={!inStock}
          ariaLabel={dict.productCard.buyAria(product.name)}
          className="h-10 flex-1"
        />
        <WishlistToggleButton
          productId={product.id}
          productName={product.name}
          variant="inline"
          className="h-10 w-[42px] shrink-0"
        />
      </div>
    </div>
  );
}
