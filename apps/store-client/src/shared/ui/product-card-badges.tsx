import { dict } from "@/shared/config";
import { Badge } from "./badge";

/**
 * ProductCardBadges — the stacked status badges in a product card's top-left
 * image corner, and `ProductCardSoldOutVeil`, the wash that dims a sold-out
 * card's photo (TASK-362).
 *
 * Split out of `ProductCard` (TASK-875) so every card that shows a saved or
 * listed product draws the same badges in the same order — the wishlist card
 * used to show neither the discount nor «Немає в наявності», and a sold-out
 * product looked buyable until the shopper reached its button. Both pieces sit
 * inside the card's `relative` image box; the badges above the stretched link
 * (z-20) so they never swallow its click, the veil just under them (z-10).
 *
 * Order and precedence are the catalogue's: sold out first, then the discount,
 * and «Новинка» only for an in-stock product that is not on sale (a sale badge
 * already says "look here", two greens and reds would compete).
 */
export function ProductCardBadges({
  inStock,
  discountPercent,
  isNew = false,
}: {
  inStock: boolean;
  /** Rounded discount; 0 (not on sale) renders no sale badge. */
  discountPercent: number;
  /** 30-day recency flag — callers without a product creation date omit it. */
  isNew?: boolean;
}) {
  const onSale = discountPercent > 0;
  const showNew = isNew && !onSale && inStock;
  if (inStock && !onSale && !showNew) {
    return null;
  }

  return (
    // `right-14` stops the stack short of the 44px heart pinned at
    // `right-2.5` (10 + 44 = 54px). On a two-up phone card (~170px) the
    // «Немає в наявності» pill is wider than what is left, so it ellipsises
    // instead of sliding under the heart; the full words stay in the DOM.
    <div className="absolute left-2.5 right-14 top-2.5 z-20 flex flex-col items-start gap-1">
      {!inStock && (
        <Badge variant="secondary" className="max-w-full shadow-sm">
          <span className="min-w-0 truncate">{dict.product.outOfStock}</span>
        </Badge>
      )}
      {onSale && (
        <Badge variant="sale" className="shadow-sm">
          −{discountPercent}%
        </Badge>
      )}
      {showNew && (
        <Badge variant="success" className="shadow-sm">
          {dict.product.newBadge}
        </Badge>
      )}
    </div>
  );
}

/**
 * Dims a sold-out card's photo rather than hiding the product: it stays
 * browsable, but a shopper scanning a grid can tell at a glance (TASK-362).
 * Decorative — the «Немає в наявності» badge carries the meaning.
 */
export function ProductCardSoldOutVeil() {
  return (
    <span
      aria-hidden="true"
      data-sold-out-veil
      className="absolute inset-0 z-10 bg-card/55"
    />
  );
}
