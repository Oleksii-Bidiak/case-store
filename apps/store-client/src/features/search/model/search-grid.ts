// The /search card grid (Д3-2 §3.6). `/search` has no filter rail, so it runs
// one column more than the catalogue from `lg` and keeps the catalogue's card
// size: 2 → 3 (md) → 4 (lg) → 5 (xl). The device block («Сам … у продажу»)
// and the results share it, so two rows of cards on one page are one width.

/**
 * Columns 1 / 2 / 3 / 4 / 5. One column below 390px, as on the catalogue
 * (TASK-415). Gap 12px on phones, 16px from `md`.
 */
export const SEARCH_GRID_CLASS =
  "grid grid-cols-1 items-stretch gap-3 min-[390px]:grid-cols-2 md:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5";

/**
 * `sizes` for a card in {@link SEARCH_GRID_CLASS} (the Search mockup's value):
 * half the viewport on phones, then a fixed 240px — at 1440 the five cards in
 * the capped container are ~230px, so nothing is served upscaled.
 */
export const SEARCH_GRID_IMAGE_SIZES = "(max-width: 767px) 50vw, 240px";

/** How many cards fill one row of the grid at `xl`. */
export const SEARCH_GRID_ROW = 5;
