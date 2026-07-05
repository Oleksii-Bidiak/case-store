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
