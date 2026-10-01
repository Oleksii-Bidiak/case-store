"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { ProductControllerFindAllParams } from "@/entities/product";
import { useBrandControllerFindAll } from "@/entities/brand";
import { useCategoryControllerGetFilterableSpecs } from "@/entities/category";
import { dict } from "@/shared/config";
import { Button } from "@/shared/ui";
import {
  clearFilterUpdates,
  hasActiveFilters as computeHasActiveFilters,
} from "../model/active-filters";
import { toFacetQueryParams } from "../model/facet-query";
import { filterRailSections } from "../model/filter-sections";
import { SearchInput } from "./search-input";
import { BrandFilter } from "./brand-filter";
import { DeviceModelFilter } from "./device-model-filter";
import { SpecFacets } from "./spec-facets";
import { FilterCheckbox } from "./filter-checkbox";
import { PriceRangeFilter } from "./price-range-filter";

interface ProductFiltersProps {
  /** Currently-active filter params (derived from the URL). */
  currentParams: ProductControllerFindAllParams;
  /**
   * The active category's ID, resolved by the parent from the category tree
   * (TASK-420).
   *
   * The URL now carries a category SLUG (`currentParams.category`), but the two
   * things this panel needs a category for — `GET /brands?categoryId=` and
   * `GET /categories/:id/filterable-specs` — are id-addressed endpoints that
   * were not part of that migration. The parent already holds the tree, so it
   * resolves once and passes the id down rather than every control re-deriving
   * it.
   */
  categoryId?: string;
  /**
   * Apply one or more filter changes at once. Passing several keys keeps the
   * update atomic. An `undefined` value removes that param.
   */
  onFilterChange: (updates: Record<string, string | undefined>) => void;
  /**
   * Prefix for the DOM ids of the inner inputs. The filter panel renders twice
   * (desktop aside + mobile drawer), so each instance needs a distinct prefix
   * to keep ids unique in the document. Defaults to `filter`.
   */
  idPrefix?: string;
  /**
   * Render each section as a native `<details>` disclosure (TASK-084 — mobile
   * drawer polish). Opt-in: only the mobile Sheet passes it, so the desktop
   * `<aside>` keeps its always-expanded layout unchanged. A section defaults
   * open when it currently holds an active filter value, closed otherwise, so a
   * returning user sees what's applied without scrolling five full cards.
   */
  collapsible?: boolean;
  /**
   * The compatible device is fixed by the route — `/catalog/[category]/[device]`
   * (TASK-490). The «Сумісний пристрій» control is not rendered at all, and
   * «скинути всі» leaves the device alone, for the same reason the category
   * chips row disappears on a category landing page: a control that rewrites
   * half of the current URL's meaning while the address bar keeps the old
   * spelling is a bug, not a filter.
   */
  lockedDevice?: boolean;
  /**
   * Leave out the «Зі знижкою» section (TASK-742). For a consumer whose
   * endpoint has no `onSale` param — `/search` (`GET /api/search`) — where the
   * box would be ticked with no effect on the results.
   */
  hideOnSale?: boolean;
  /**
   * «Зі знижкою» is fixed by the route — `/promo` (TASK-1301). The section is
   * left out (as with `hideOnSale`) AND the reset neither counts nor clears
   * it: on that page the discount is the listing itself, not a filter.
   */
  lockedOnSale?: boolean;
  /**
   * Leave out the structured-spec facets even when a category is active
   * (TASK-523). `/search` narrows by category — so it passes `categoryId`,
   * which scopes the brand list — but `GET /api/search` has no `?specs=`, and
   * facet checkboxes there would be ticked with no effect on the results.
   */
  hideSpecFacets?: boolean;
}

const cardClass =
  "rounded-2xl border border-border bg-card p-[18px] shadow-card";
const cardTitleClass =
  "font-display text-[15px] font-bold tracking-tight text-card-foreground";

/**
 * Filter panel for the product list page, styled as stacked cards (keyword
 * search, price). Each control writes its change back to the URL via
 * `onFilterChange`; sorting and the grid/list toggle live in the page toolbar.
 * Category selection moved to the `CategoryChips` row above the grid
 * (TASK-216) and is intentionally no longer part of this stack.
 */
export function ProductFilters({
  currentParams,
  categoryId,
  onFilterChange,
  idPrefix = "filter",
  collapsible = false,
  lockedDevice = false,
  hideOnSale = false,
  lockedOnSale = false,
  hideSpecFacets = false,
}: ProductFiltersProps) {
  // Every filter this panel owns — search, brand, device, price, spec facets and
  // availability. Sourced from the one shared definition (TASK-414) so the
  // button's VISIBILITY and what it CLEARS can never drift apart again: until
  // now it appeared for four of them and cleared those same four, leaving a
  // device or spec selection applied and the button gone.
  //
  // `includeCategory: false` — the category's control is the chips row above the
  // grid (TASK-216) and, on a category landing page, the route itself; clearing
  // it from in here would navigate the shopper somewhere they did not ask to go.
  //
  // `includeDevice` follows the same rule one segment down: on
  // `/catalog/[category]/[device]` the device IS the route (TASK-490), so the
  // panel neither offers it nor clears it.
  const panelFilterScope = {
    includeCategory: false,
    includeDevice: !lockedDevice,
    includeOnSale: !lockedOnSale,
  } as const;
  const hasActiveFilters = computeHasActiveFilters(
    currentParams,
    panelFilterScope,
  );

  // Which sections this rail shows, in render order (TASK-515). The catalogue
  // skeleton draws its placeholder cards from the same `filterRailSections`, so
  // gating here — not on ad-hoc prop checks — keeps the two from drifting.
  const sections = new Set(
    filterRailSections({
      lockedDevice,
      hideOnSale,
      lockedOnSale,
      hideSpecFacets,
      hasCategory: Boolean(categoryId),
    }),
  );

  // Presence gates for the collapsible mobile drawer only: BrandFilter and
  // SpecFacets self-hide (return null) when they have no data, but a `<details>`
  // wrapper would still show a bare header. So in collapsible mode we mirror
  // their own emptiness check here to skip the disclosure entirely. Both hooks
  // are deduped by React Query (the list view already fetches brands; SpecFacets
  // itself refetches the same key) and are gated off on desktop.
  const { data: brandsData } = useBrandControllerFindAll(
    // Same category scope BrandFilter itself uses (TASK-414), so the drawer's
    // presence gate and the control agree — otherwise the disclosure could open
    // onto a control that self-hides.
    categoryId ? { categoryId } : undefined,
    { query: { enabled: collapsible } },
  );
  const hasBrands = (brandsData?.data.length ?? 0) > 0;
  const { data: specsData } = useCategoryControllerGetFilterableSpecs(
    categoryId ?? "",
    // The SAME params `SpecFacets` sends (TASK-489), or this gate would fetch a
    // second, differently-keyed copy of the facet list — and could then open a
    // disclosure onto a control that self-hides because its own list is narrower.
    toFacetQueryParams(currentParams),
    {
      query: {
        enabled: collapsible && sections.has("specs"),
      },
    },
  );
  const hasSpecs = sections.has("specs") && (specsData?.data.length ?? 0) > 0;

  /**
   * Render one filter section's chrome. In `collapsible` mode it is a native
   * `<details>` card (summary = title + rotating chevron, no JS state — `<details
   * open>` is the single source of truth); otherwise the existing always-expanded
   * card `<div>` (desktop layout unchanged). `title == null` (search) renders no
   * heading in the flat layout, matching today's markup.
   */
  const renderSection = (
    title: string | null,
    control: ReactNode,
    activeDefaultOpen: boolean,
  ) => {
    if (!collapsible) {
      return (
        <div className={cardClass}>
          {title && <h3 className={`${cardTitleClass} mb-4`}>{title}</h3>}
          {control}
        </div>
      );
    }
    return (
      <details
        className="group rounded-2xl border border-border bg-card shadow-card"
        open={activeDefaultOpen}
      >
        <summary
          aria-label={dict.filters.sectionToggleAria(title ?? "")}
          className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-2xl p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset [&::-webkit-details-marker]:hidden"
        >
          <span className={cardTitleClass}>{title}</span>
          <ChevronDown
            aria-hidden="true"
            className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
          />
        </summary>
        <div className="px-4 pb-4">{control}</div>
      </details>
    );
  };

  return (
    <div className="flex flex-col gap-3.5">
      {/* Keyword search */}
      {renderSection(
        collapsible ? dict.filters.searchLabel : null,
        <SearchInput
          id={`${idPrefix}-search`}
          initialValue={currentParams.search ?? ""}
          onSearch={(value) => onFilterChange({ search: value })}
        />,
        Boolean(currentParams.search),
      )}

      {/* Availability — TASK-414. `?inStock=true`; the server reads it as
          `stock > 0`. Absent rather than `false` when unticked, so an unused
          filter never appears in a shared link (and never splits the cache). */}
      {renderSection(
        dict.filters.availabilityTitle,
        <FilterCheckbox
          id={`${idPrefix}-in-stock`}
          label={dict.filters.inStockOnly}
          checked={currentParams.inStock === true}
          onCheckedChange={(checked) =>
            onFilterChange({ inStock: checked ? "true" : undefined })
          }
        />,
        currentParams.inStock === true,
      )}

      {/* «Зі знижкою» — TASK-742. `?onSale=true`; the server reads it as
          `compareAtPrice > price`. Same absent-when-unticked rule as the
          availability box above. Hidden where the endpoint behind the panel
          does not take the param (`/search`), so it can never be a control
          that silently does nothing, and on `/promo`, where the route fixes it
          (TASK-1301) — both read from the section list (TASK-515). */}
      {sections.has("onSale") &&
        renderSection(
          dict.filters.saleTitle,
          <FilterCheckbox
            id={`${idPrefix}-on-sale`}
            label={dict.filters.onSaleOnly}
            checked={currentParams.onSale === true}
            onCheckedChange={(checked) =>
              onFilterChange({ onSale: checked ? "true" : undefined })
            }
          />,
          currentParams.onSale === true,
        )}

      {/* Manufacturer (brand) filter — TASK-189. Hidden when no brands exist.
          Collapsible drawer gates on `hasBrands` and strips BrandFilter's own
          card chrome (the <details> provides it); desktop keeps its self-card. */}
      {collapsible ? (
        hasBrands &&
        renderSection(
          dict.filters.brandTitle,
          <BrandFilter
            activeBrandSlug={currentParams.brand}
            categoryId={categoryId}
            onSelect={(brand) => onFilterChange({ brand })}
            cardClassName=""
            titleClassName="sr-only"
          />,
          Boolean(currentParams.brand),
        )
      ) : (
        <BrandFilter
          activeBrandSlug={currentParams.brand}
          categoryId={categoryId}
          onSelect={(brand) => onFilterChange({ brand })}
          cardClassName={cardClass}
          titleClassName={`${cardTitleClass} mb-4`}
        />
      )}

      {/* Device compatibility (TASK-190) — brand → model cascade. Absent when
          the route already names the device (TASK-490). */}
      {sections.has("device") &&
        renderSection(
          dict.filters.deviceTitle,
          <DeviceModelFilter
            idPrefix={idPrefix}
            currentDeviceModelSlug={currentParams.device}
            onChange={(device) => onFilterChange({ device })}
          />,
          Boolean(currentParams.device),
        )}

      {/* Price range */}
      {renderSection(
        dict.filters.priceTitle,
        // The inputs + two-thumb slider (TASK-208), shared with the wishlist
        // rail since TASK-1300. Committed bounds come from the URL.
        <PriceRangeFilter
          idPrefix={idPrefix}
          committedMin={currentParams.minPrice}
          committedMax={currentParams.maxPrice}
          onCommit={onFilterChange}
        />,
        currentParams.minPrice != null || currentParams.maxPrice != null,
      )}

      {/* Structured-spec facets (TASK-191) — category-scoped; renders nothing
          when no category is active or it has no filterable specs. Collapsible
          drawer gates on `hasSpecs` and strips the facet card's own chrome.
          Left out altogether with `hideSpecFacets` (TASK-523) or with no
          category (TASK-515 — the section list says so either way). */}
      {!sections.has("specs") ? null : collapsible ? (
        hasSpecs &&
        renderSection(
          dict.filters.specsTitle,
          <SpecFacets
            categoryId={categoryId}
            currentParams={currentParams}
            onFilterChange={onFilterChange}
            idPrefix={idPrefix}
            cardClassName=""
            titleClassName="sr-only"
          />,
          Boolean(currentParams.specs),
        )
      ) : (
        <SpecFacets
          categoryId={categoryId}
          currentParams={currentParams}
          onFilterChange={onFilterChange}
          idPrefix={idPrefix}
        />
      )}

      {hasActiveFilters && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start text-muted-foreground hover:text-foreground"
          onClick={() => onFilterChange(clearFilterUpdates(panelFilterScope))}
        >
          {dict.filters.clear}
        </Button>
      )}
    </div>
  );
}
