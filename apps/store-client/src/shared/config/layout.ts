// Layout constants — sticky-header clearing convention (TASK-206 / TASK-234).
//
// The site header is `sticky top-0 z-50`. Since TASK-2074 its height is not a
// constant: the 64px row plus the «Мої пристрої» bar (tier 1 at every width,
// tier 2 from 1024 with a saved device). Any other sticky panel (filter rails,
// summary asides, TOCs, side navs) stacks below it in the viewport, so it must
// reserve the header's height plus 32px of breathing room or it slides under
// the header the moment it sticks. The header publishes its measured height as
// `--header-height` (`useHeaderHeight`); globals.css turns it into
// `--sticky-header-offset`, with a pre-hydration CSS fallback.

/** Breathing room between the sticky header's bottom edge and a stuck panel. */
export const STICKY_HEADER_GAP = 32;

/**
 * Fallback offset when the header cannot be measured (SSR, tests): the bare
 * 64px row + the gap. Runtime code calls `getStickyHeaderOffset()` instead.
 */
export const STICKY_HEADER_OFFSET = 96;

/**
 * Pixel offset that clears the sticky site header right now. Use for
 * scroll-spy thresholds and programmatic `scrollTo` math so scrolled-to
 * sections land below the header. Same value as `--sticky-header-offset`.
 */
export function getStickyHeaderOffset(): number {
  if (typeof document === "undefined") return STICKY_HEADER_OFFSET;
  const header = document.querySelector<HTMLElement>("[data-site-header]");
  if (!header) return STICKY_HEADER_OFFSET;
  return Math.ceil(header.getBoundingClientRect().height) + STICKY_HEADER_GAP;
}

/**
 * Tailwind `top-*` class for sticky asides — the `--sticky-header-offset`
 * custom property (header height + 32px). It carries no breakpoint: pair it
 * with the breakpoint-prefixed `sticky` of the layout that needs it
 * (`lg:sticky` for the two-column pages, `md:sticky` for the PDP buy box).
 * Below that breakpoint the element is not positioned, so `top` has no effect.
 */
export const STICKY_ASIDE_TOP = "top-(--sticky-header-offset)";

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
