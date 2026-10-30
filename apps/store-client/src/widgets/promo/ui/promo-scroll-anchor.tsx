/**
 * The first element of the `/promo` page segment — the page and its
 * `loading.tsx` both open with it (TASK-1991).
 *
 * On a fresh navigation Next scrolls to the first element of the deepest new
 * segment: if its top is not in the viewport once the document is at the top,
 * it calls `scrollIntoView()` on it. The page segment streams into the deals
 * slot of the layout's frame (TASK-869), two screens below the hero, so without
 * this the route opened scrolled down to the listing.
 *
 * The anchor is absolutely pinned to the top of `PromoView`'s root (the frame
 * is `relative`), so the segment's first element sits at the breadcrumb, Next
 * finds it in view and the page opens at the top. It must keep a box (not
 * `display: none`, not zero-sized) — Next skips an element whose rect is all
 * zeros and falls through to the next sibling, the listing. Filter, sort and
 * page changes are unaffected: they navigate to `#deals`, and a hash
 * navigation scrolls to that id instead.
 */
export function PromoScrollAnchor() {
  return (
    <div
      aria-hidden="true"
      data-testid="promo-scroll-anchor"
      className="pointer-events-none invisible absolute inset-x-0 top-0 h-px"
    />
  );
}
