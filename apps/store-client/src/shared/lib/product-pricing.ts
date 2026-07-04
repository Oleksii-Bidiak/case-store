// Card price-selection logic, extracted as a pure helper so ProductCard and
// ProductListItem share one implementation and it is unit-testable (TASK-199).

/**
 * The subset of `PublicProductEntity` the pricing derivation needs. Structural
 * (not the generated type) so pure-logic tests don't depend on the generated
 * API client.
 */
export interface CardPricingInput {
  /** This position's own price, as a decimal string. */
  price: string;
  /** Optional strike-through price, as a decimal string. */
  compareAtPrice?: string | null;
  /** Compact group summary from the list API (absent on legacy payloads). */
  variantSummary?: {
    /** Cheapest price across the group's active positions. */
    priceFrom: string;
    /** Number of active positions in the group (>= 1). */
    variantCount: number;
  } | null;
}

export interface CardPricing {
  /** The price the card displays — ALWAYS this position's own price. */
  advertisedPrice: string;
  /** Whether to render the "від" (from) prefix before the price. */
  showFrom: boolean;
  /** Whether the position is on sale against its own compare-at price. */
  onSale: boolean;
  /** Rounded percentage discount when on sale, otherwise 0. */
  discountPercent: number;
}

/**
 * Derive the advertised price block for a product card.
 *
 * Since TASK-142 every card is ONE first-class position (e.g. «Double Pack»),
 * so the card must advertise the position's OWN `price` — never the group's
 * cheapest (`variantSummary.priceFrom`), which belongs to a sibling card
 * (TASK-199: the Double Pack card showed the Single Pack price).
 *
 * The «від …» prefix survives only where it is truthful: on the group's
 * cheapest position (its own price IS the group minimum) when the group has
 * more than one position. Costlier siblings show their own price with no
 * prefix.
 *
 * Sale state and the discount percentage compare the position's own
 * `compareAtPrice` against its own `price` — never against a sibling's.
 */
export function getCardPricing(product: CardPricingInput): CardPricing {
  const { price, compareAtPrice, variantSummary } = product;

  // "від" is truthful only when this position is (one of) the cheapest in a
  // multi-position group. `<=` also covers a stale summary reporting a
  // higher-than-own minimum. Numeric compare — decimal strings may differ in
  // formatting ("12.99" vs "12.990").
  const showFrom =
    variantSummary != null &&
    variantSummary.variantCount > 1 &&
    Number(price) <= Number(variantSummary.priceFrom);

  const onSale =
    compareAtPrice != null && Number(compareAtPrice) > Number(price);

  const discountPercent =
    onSale && compareAtPrice
      ? Math.round((1 - Number(price) / Number(compareAtPrice)) * 100)
      : 0;

  return { advertisedPrice: price, showFrom, onSale, discountPercent };
}
