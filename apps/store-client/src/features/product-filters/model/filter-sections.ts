/**
 * The filter rail's sections, in the order `ProductFilters` renders them
 * (TASK-515). One list, read by the panel itself AND by the catalogue skeleton
 * (`widgets/product-list/ui/product-list-skeleton.tsx`), so the placeholder
 * rail can no longer be "the five cards the panel used to have" while the real
 * one grows — the jump TASK-416 removed came back exactly that way once
 * TASK-742 added «Знижки» and category pages gained «Характеристики».
 */
export const FILTER_SECTION_ORDER = [
  "search",
  "availability",
  "onSale",
  "brand",
  "device",
  "price",
  "specs",
] as const;

export type FilterSectionId = (typeof FILTER_SECTION_ORDER)[number];

export interface FilterSectionOptions {
  /** The route fixes the device (`/catalog/[category]/[device]`, TASK-490). */
  lockedDevice?: boolean;
  /** The endpoint takes no `onSale` (`/search`, TASK-742). */
  hideOnSale?: boolean;
  /**
   * The route fixes «Зі знижкою» (`/promo`, TASK-1301) — the discount is the
   * listing itself there, so the rail has no box for it.
   */
  lockedOnSale?: boolean;
  /** The endpoint takes no `specs` (`/search`, TASK-523). */
  hideSpecFacets?: boolean;
  /** A category is active — spec facets are category-scoped (TASK-191). */
  hasCategory?: boolean;
}

/**
 * The sections the rail shows for a given set of route/endpoint options, in
 * render order.
 *
 * Structural only: «Виробник» and «Характеристики» additionally self-hide when
 * their data comes back empty (no brands, a category without filterable
 * specs). That is a property of the data, not of the page, so it is not
 * modelled here — a skeleton cannot know it before the request either.
 */
export function filterRailSections({
  lockedDevice = false,
  hideOnSale = false,
  lockedOnSale = false,
  hideSpecFacets = false,
  hasCategory = false,
}: FilterSectionOptions = {}): FilterSectionId[] {
  return FILTER_SECTION_ORDER.filter((section) => {
    switch (section) {
      case "onSale":
        return !hideOnSale && !lockedOnSale;
      case "device":
        return !lockedDevice;
      case "specs":
        return hasCategory && !hideSpecFacets;
      default:
        return true;
    }
  });
}
