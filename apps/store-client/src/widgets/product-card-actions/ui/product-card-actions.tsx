"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { AddToCartButton } from "@/features/add-to-cart";
import { DeviceFitMark } from "@/features/device-fit";
import { WishlistToggleButton } from "@/features/toggle-wishlist";
import { useGetCart } from "@/entities/cart";
import { useAuth } from "@/entities/session";
import { CartSheet } from "@/widgets/cart";
import { Button } from "@/shared/ui";
import type { PublicProductEntity } from "@/shared/api/generated/models";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";

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
 *
 * Above the availability line sits the «Підходить до / Не для <модель>» mark
 * for the shopper's active device (TASK-1953). It appears only after the
 * device store hydrates, into a fixed two-line slot that every product with
 * compatibility data holds from the server render on; the mark is clamped to
 * those two lines, so it never shifts the card. Trade-off: without a saved
 * device the slot stays empty, and in a row that mixes compat and non-compat
 * products the compat cards' prices sit one slot higher than their
 * neighbours' (stock lines and buttons still align). Collapsing the slot for
 * visitors without a device needs a pre-paint flag in the root layout.
 */
export function ProductCardActions({
  product,
  showFit = true,
  layout = "stack",
}: {
  product: PublicProductEntity;
  /**
   * Render the device-fit mark here. The catalog list row turns it off and
   * places the mark under the rating instead (Catalog mockup §4).
   */
  showFit?: boolean;
  /**
   * `stack` — a card footer: stock line over the buttons. `list` — the
   * catalog list row's buy area (Catalog mockup §4): below 768px one row,
   * stock line then the buttons pushed right; from 768px the 250px column
   * stacks like a card footer.
   */
  layout?: "stack" | "list";
}) {
  const list = layout === "list";
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
    <div
      className={cn(
        "flex flex-col gap-2",
        list &&
          "flex-row flex-wrap items-center gap-x-3 md:flex-col md:flex-nowrap md:items-stretch",
      )}
    >
      {showFit && (
        <DeviceFitMark
          compatibleDeviceModelIds={product.compatibleDeviceModelIds}
          reserveSpace
        />
      )}
      <p
        className={`flex items-center gap-1.5 text-xs ${
          inStock ? "text-success" : "text-muted-foreground"
        }`}
      >
        <span
          aria-hidden="true"
          className="size-2.5 shrink-0 rounded-full bg-current"
        />
        {inStock
          ? dict.productCard.inStockLine
          : dict.productCard.outOfStockLine}
      </p>
      <div className={cn("flex gap-2", list && "ml-auto md:ml-0")}>
        {inCart ? (
          // Already in cart — takes precedence over out-of-stock (the line is
          // already reserved in the cart); opens the mini-cart to manage it.
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={openCartSheet}
            aria-label={dict.productCard.inCartAria(product.name)}
            className={cn(
              "h-10 flex-1 border-success/40 font-semibold text-success hover:border-success/60 hover:bg-success/10 hover:text-success active:bg-success/10",
              list && "flex-none px-5 md:flex-1",
            )}
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
            className={cn("h-10 flex-1", list && "flex-none px-5 md:flex-1")}
          />
        )}
        <WishlistToggleButton
          productId={product.id}
          productName={product.name}
          variant="inline"
          className="h-10 w-10.5 shrink-0"
        />
      </div>
      {sheetMounted && (
        <CartSheet open={sheetOpen} onOpenChange={setSheetOpen} />
      )}
    </div>
  );
}
