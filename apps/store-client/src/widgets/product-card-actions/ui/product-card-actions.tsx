"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { AddToCartButton } from "@/features/add-to-cart";
import { WishlistToggleButton } from "@/features/toggle-wishlist";
import { useGetCart } from "@/entities/cart";
import { useAuth } from "@/entities/session";
import { CartSheet } from "@/widgets/cart";
import { Button } from "@/shared/ui";
import type { PublicProductEntity } from "@/shared/api/generated/models";
import { dict } from "@/shared/config";

/**
 * ProductCardActions — the product-card footer from the design import: a small
 * availability line, then a "Купити" primary button (grows) next to an icon-only
 * wishlist heart. Passed to `<ProductCard action=…>` so `shared/ui` stays free of
 * feature imports; the heart lives here (in the footer), not floating on the image.
 *
 * When this card's position is ALREADY in the cart, the quick-add button flips to
 * a persistent «В кошику» state (TASK-213). The state is derived from the SAME
 * cached `useGetCart` query the header badge observes (guest cart included, via
 * the cartToken cookie), so it survives reloads and adds no extra request.
 * Clicking the in-cart button opens the mini-cart sheet — the same slide-out the
 * header badge opens. The sheet is mounted lazily on first open so a grid of
 * cards doesn't mount dozens of idle sheets.
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

  // Share the header badge's cached cart query; hold until the auth bootstrap
  // settles so it never reflects a transient empty guest cart minted during
  // refresh (TASK-118). Extra observers of the same query key are free.
  const { isInitializing } = useAuth();
  const { data } = useGetCart({ query: { enabled: !isInitializing } });
  const inCart =
    data?.data?.items?.some((item) => item.productId === product.id) ?? false;

  const [sheetMounted, setSheetMounted] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const openCartSheet = () => {
    setSheetMounted(true);
    setSheetOpen(true);
  };

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
        {inCart ? (
          // Already in cart — takes precedence over out-of-stock (the line is
          // already reserved in the cart); opens the mini-cart to manage it.
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={openCartSheet}
            aria-label={dict.productCard.inCartAria(product.name)}
            className="h-10 flex-1 cursor-pointer border-success/40 font-semibold text-success transition-all hover:bg-success/10 hover:text-success active:scale-[0.99]"
          >
            <Check aria-hidden="true" className="size-4" />
            {dict.productCard.inCart}
          </Button>
        ) : (
          <AddToCartButton
            productId={product.id}
            compact
            outOfStock={!inStock}
            ariaLabel={dict.productCard.buyAria(product.name)}
            className="h-10 flex-1"
          />
        )}
        <WishlistToggleButton
          productId={product.id}
          productName={product.name}
          variant="inline"
          className="h-10 w-[42px] shrink-0"
        />
      </div>
      {sheetMounted && (
        <CartSheet open={sheetOpen} onOpenChange={setSheetOpen} />
      )}
    </div>
  );
}
