// The product-card grid shared by every catalogue-style listing (TASK-1957):
// `/products`, `/categories/[slug]`, `/promo/*`, `/search` and `/wishlist`,
// and each of their skeletons. One constant, so the real grid and its skeleton
// cannot drift — a skeleton laid out in other columns reflows the page the
// moment real cards replace it (TASK-415).

/**
 * The phone-to-tablet part of the ladder — 1 / 2 / 3 columns at 0 / 390 / `md`
 * with the mockup gap rhythm. Every product-card grid starts from it; only the
 * desktop columns differ (`/search`, which has no filter rail, adds one more
 * column from `lg` — `SEARCH_GRID_CLASS`).
 */
export const PRODUCT_GRID_BASE_CLASS =
  "grid grid-cols-1 items-stretch gap-3 min-[390px]:grid-cols-2 md:grid-cols-3 md:gap-4";

/**
 * Columns 1 / 2 / 3 / 4 — direction В, Catalog mockup (Д3-2):
 * - below 390px: one card (TASK-415 — on the narrowest phones a 2-up row left
 *   the photo, the price and the button unreadable; `min-[390px]` is the
 *   design viewport, not a Tailwind breakpoint);
 * - 390–767px: two;
 * - 768–1279px: three (`md`; the 268px filter rail joins at `lg` = 1024px,
 *   which is exactly why 4-up stopped fitting there — cards were ~150px);
 * - from 1280px (`xl`): four.
 *
 * Gap 12px on phones, 16px from `md` — the mockup's card rhythm; it gives the
 * cards, not the gutters, the width at 390 and at 1024.
 * `items-stretch` (+ `h-full` on the card root) keeps a row one height.
 */
export const PRODUCT_GRID_CLASS = `${PRODUCT_GRID_BASE_CLASS} xl:grid-cols-4`;

/**
 * `next/image` `sizes` for a card in `PRODUCT_GRID_CLASS` — the default of
 * `ProductCardImage`. Each stop tracks a column change of the grid above
 * inside `PAGE_CONTAINER` (gutter 16px, 24px from `sm`, 32px from `lg`):
 * - < 390: one card, viewport minus the gutters;
 * - 390–767: two cards, half the viewport minus gutter and gap;
 * - 768–1023: three cards, no rail;
 * - 1024–1279: three cards beside the 268px rail + 28px gap (210–294px);
 * - ≥ 1280: four cards, ~218–228px — a fixed cap, since the container is
 *   capped at 1320px (TASK-210: a vw-based last stop over-downloads).
 */
export const PRODUCT_GRID_IMAGE_SIZES =
  "(max-width: 389px) calc(100vw - 2rem), (max-width: 767px) calc(50vw - 1.5rem), (max-width: 1023px) calc(33vw - 1.5rem), (max-width: 1279px) calc(33vw - 8rem), 228px";
