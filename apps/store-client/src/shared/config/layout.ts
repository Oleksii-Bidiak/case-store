// Layout constants — sticky-header clearing convention (TASK-206 / TASK-234).
//
// The site header is `sticky top-0 z-50` with 64px of content (`h-16`). Any
// other sticky panel (filter rails, summary asides, TOCs, side navs) stacks
// below it in the viewport, so it must reserve enough top offset or it slides
// under the header the moment it sticks. The storefront convention is a 96px
// clearance: 64px header + 32px breathing room.

/**
 * Pixel offset that clears the sticky site header. Use for scroll-spy
 * thresholds and programmatic `scrollTo` math so scrolled-to sections land
 * below the header. Keep in sync with `STICKY_ASIDE_TOP` (96px = `top-24`).
 */
export const STICKY_HEADER_OFFSET = 96;

/**
 * Tailwind `top-*` class for sticky asides in `lg:` two-column layouts —
 * always pair with `lg:sticky`. `top-24` = 96px = `STICKY_HEADER_OFFSET`.
 */
export const STICKY_ASIDE_TOP = "lg:top-24";

/**
 * The one page container (owner decision 7.1, TASK-860): 1320px wide via the
 * `--container-page` token (`max-w-page`), with the house gutter
 * `px-4 sm:px-6 lg:px-8`. Every page, every `loading.tsx`, the header, the
 * announcement bar, the footer and every full-width homepage section use it,
 * so their left edges line up at every viewport. Add vertical padding next to
 * it (`${PAGE_CONTAINER} py-8`); narrower content (article prose, auth forms,
 * order lists, legal documents) is an INNER width placed inside it, never a
 * replacement for it.
 */
export const PAGE_CONTAINER = "mx-auto w-full max-w-page px-4 sm:px-6 lg:px-8";
