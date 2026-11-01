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
import { keepFacetsOfCategory, toFacetQueryParams } from "../model/facet-query";
import { filterRailSections } from "../model/filter-sections";
import {
  isMyDevicesFilterOn,
  parseDeviceParam,
} from "../model/my-devices-filter";
import { parseSpecParam } from "../model/spec-facet";
import { useMyDevicesFilter } from "../model/use-my-devices-filter";
import { MyDevicesFilter } from "./my-devices-filter";
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
  /**
   * Top the panel with «З урахуванням моїх пристроїв» (TASK-2077). Opt-in: the
   * catalogue listings pass it; `/search` has its own device row (TASK-2069).
   * Ignored with `lockedDevice`.
   */
  withMyDevices?: boolean;
}

/** The one «Фільтри товарів» panel — the rail's other panels' shell. */
const panelClass =
  "rounded-2xl border border-border bg-card px-3.5 py-2 shadow-card";
/**
 * One section of it: a hairline above every section but the first (Catalog
 * §12). `first:` / `last:` trim the outer padding against the panel's own.
 */
const sectionClass =
  "border-t border-border px-1.5 py-3.5 first:border-t-0 first:pt-2 last:pb-2";
const sectionTitleClass = "text-sm font-bold text-card-foreground";

/**
 * The catalogue's filter column (Д3-2 Catalog §12): «З урахуванням моїх
 * пристроїв» on top, then ONE «Фільтри товарів» panel whose sections are split
 * by a hairline — Наявність → Ціна (with «Зі знижкою») → Виробник → Сумісний
 * пристрій → the category's spec facets (Матеріал, Колір…). A section with a
 * selection says how many («· 2») and offers its own «Скинути». Each control
 * writes its change back to the URL via `onFilterChange`; sorting and the
 * grid/list toggle live in the page toolbar, the category is the tree above
 * (TASK-2011), and a keyword is the header search's job — the panel no longer
 * carries a second search box.
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
  withMyDevices = false,
}: ProductFiltersProps) {
  // Every filter this panel owns — search, brand, device, price, spec facets and
  // availability. Sourced from the one shared definition (TASK-414) so the
  // button's VISIBILITY and what it CLEARS can never drift apart again: until
  // now it appeared for four of them and cleared those same four, leaving a
  // device or spec selection applied and the button gone.
  //
  // `includeCategory: false` — the category's control is the category tree
  // (TASK-2011) and, on a category landing page, the route itself; clearing
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
      withMyDevices,
    }),
  );

  // «З урахуванням моїх пристроїв» and the brand → model cascade both write
  // the one `?device=` (TASK-2077). While the panel drives it — or the param
  // holds several slugs, which a single-model select cannot show — the
  // cascade steps aside instead of showing the same choice twice.
  const myDevices = useMyDevicesFilter(currentParams.device);
  const showDeviceCascade =
    sections.has("device") &&
    !(sections.has("myDevices") && isMyDevicesFilterOn(myDevices.state)) &&
    parseDeviceParam(currentParams.device).length <= 1;

  // Presence gates: BrandFilter and SpecFacets self-hide (return null) when
  // they have no data, but the section around them would still show a bare
  // header. So the panel mirrors their emptiness check to skip the section.
  // Both hooks are deduped by React Query (the list view already fetches
  // brands; SpecFacets itself reads the same facet key).
  const { data: brandsData, isPending: brandsPending } =
    useBrandControllerFindAll(
      // Same category scope BrandFilter itself uses (TASK-414), so the
      // section's presence gate and the control agree.
      categoryId ? { categoryId } : undefined,
    );
  // While the list is in flight the section holds its place (TASK-515).
  const showBrands = brandsPending || (brandsData?.data.length ?? 0) > 0;
  const { data: specsData } = useCategoryControllerGetFilterableSpecs(
    categoryId ?? "",
    // The SAME params `SpecFacets` sends (TASK-489), or this gate would fetch a
    // second, differently-keyed copy of the facet list — and could then open a
    // disclosure onto a control that self-hides because its own list is narrower.
    toFacetQueryParams(currentParams),
    {
      query: {
        enabled: sections.has("specs") && Boolean(categoryId),
        // Same as `SpecFacets` (TASK-515): a tick refetches the counts, and
        // the section must not vanish while they are in flight.
        placeholderData: keepFacetsOfCategory(categoryId),
      },
    },
  );
  const hasSpecs = sections.has("specs") && (specsData?.data.length ?? 0) > 0;
  const specsSelected = parseSpecParam(currentParams.specs).reduce(
    (sum, entry) => sum + entry.values.length,
    0,
  );

  const priceActive =
    currentParams.minPrice != null || currentParams.maxPrice != null;
  // «Зі знижкою» is a row of the price section — it counts there.
  const saleActive = sections.has("onSale") && currentParams.onSale === true;

  /**
   * One section of the panel. Flat in the rail: a header (title, «· n»,
   * «Скинути») over the control. In the drawer (`collapsible`) a native
   * `<details>` — summary = title + rotating chevron, no JS state, open where
   * a filter is active — so a returning shopper sees what is applied without
   * scrolling every section open.
   */
  const renderSection = ({
    id,
    title,
    control,
    selected = 0,
    onReset,
    hideTitle = false,
  }: {
    id: string;
    title: string;
    control: ReactNode;
    /** How many of its options are on — «· n» and the drawer's open state. */
    selected?: number;
    /** The section's own reset, offered while something is selected. */
    onReset?: () => void;
    /** The control brings its own headings (the spec facets' legends). */
    hideTitle?: boolean;
  }) => {
    const resetButton =
      onReset && selected > 0 ? (
        <button
          type="button"
          onClick={onReset}
          aria-label={dict.filters.sectionResetAria(title)}
          className="shrink-0 rounded-sm text-xs font-semibold text-muted-foreground underline underline-offset-3 transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:transition-none"
        >
          {dict.filters.sectionReset}
        </button>
      ) : null;
    const heading = (
      <span className={sectionTitleClass}>
        {title}
        {selected > 0 && (
          <span className="ml-1 text-xs font-semibold text-muted-foreground">
            {dict.filters.sectionSelected(selected)}
          </span>
        )}
      </span>
    );

    if (!collapsible) {
      return (
        <div key={id} className={sectionClass} data-filter-section={id}>
          {/* With `hideTitle` the control's own (sr-only) heading names it. */}
          {!hideTitle && (
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h3 className="min-w-0">{heading}</h3>
              {resetButton}
            </div>
          )}
          {control}
        </div>
      );
    }
    return (
      <details
        key={id}
        className={`group ${sectionClass}`}
        data-filter-section={id}
        open={selected > 0}
      >
        <summary
          aria-label={dict.filters.sectionToggleAria(title)}
          className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-menu outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden"
        >
          {heading}
          <ChevronDown
            aria-hidden="true"
            className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
          />
        </summary>
        <div className="pt-2">
          {resetButton && (
            <div className="mb-1 flex justify-end">{resetButton}</div>
          )}
          {control}
        </div>
      </details>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {/* «З урахуванням моїх пристроїв» (TASK-2077) — the first block, always
          expanded, in the rail and the drawer alike. */}
      {sections.has("myDevices") && (
        <MyDevicesFilter
          filter={myDevices}
          currentParams={currentParams}
          onFilterChange={onFilterChange}
          idPrefix={idPrefix}
        />
      )}

      <section aria-label={dict.filters.panelAria} className={panelClass}>
        {/* Availability — TASK-414. `?inStock=true`; the server reads it as
            `stock > 0`. Absent rather than `false` when unticked, so an unused
            filter never appears in a shared link (and never splits the cache). */}
        {renderSection({
          id: "availability",
          title: dict.filters.availabilityTitle,
          selected: currentParams.inStock === true ? 1 : 0,
          control: (
            <FilterCheckbox
              id={`${idPrefix}-in-stock`}
              label={dict.filters.inStockOnly}
              checked={currentParams.inStock === true}
              onCheckedChange={(checked) =>
                onFilterChange({ inStock: checked ? "true" : undefined })
              }
            />
          ),
        })}

        {/* Price range — the inputs + two-thumb slider (TASK-208), shared with
            the wishlist rail since TASK-1300; committed bounds come from the
            URL. «Зі знижкою» (TASK-742, `?onSale=true`) rides along under it:
            it is a price question too. Left out where the endpoint behind the
            panel has no such param (`/search`) and on `/promo`, where the
            route fixes it (TASK-1301) — both read from the section list. */}
        {renderSection({
          id: "price",
          title: dict.filters.priceTitle,
          selected: (priceActive ? 1 : 0) + (saleActive ? 1 : 0),
          onReset: () =>
            onFilterChange({
              minPrice: undefined,
              maxPrice: undefined,
              ...(saleActive ? { onSale: undefined } : {}),
            }),
          control: (
            <>
              <PriceRangeFilter
                idPrefix={idPrefix}
                committedMin={currentParams.minPrice}
                committedMax={currentParams.maxPrice}
                onCommit={onFilterChange}
              />
              {sections.has("onSale") && (
                <div className="mt-3">
                  <FilterCheckbox
                    id={`${idPrefix}-on-sale`}
                    label={dict.filters.onSaleOnly}
                    checked={currentParams.onSale === true}
                    onCheckedChange={(checked) =>
                      onFilterChange({ onSale: checked ? "true" : undefined })
                    }
                  />
                </div>
              )}
            </>
          ),
        })}

        {/* Manufacturer (brand) — TASK-189; checkbox rows since Д3-2. Hidden
            once the list turns out empty. */}
        {showBrands &&
          renderSection({
            id: "brand",
            title: dict.filters.brandTitle,
            selected: currentParams.brand ? 1 : 0,
            onReset: () => onFilterChange({ brand: undefined }),
            control: (
              <BrandFilter
                idPrefix={idPrefix}
                activeBrandSlug={currentParams.brand}
                categoryId={categoryId}
                onSelect={(brand) => onFilterChange({ brand })}
              />
            ),
          })}

        {/* Device compatibility (TASK-190) — brand → model cascade, for a
            shopper whose device the panel above does not drive. Absent when
            the route already names the device (TASK-490). */}
        {showDeviceCascade &&
          renderSection({
            id: "device",
            title: dict.filters.deviceTitle,
            selected: currentParams.device ? 1 : 0,
            onReset: () => onFilterChange({ device: undefined }),
            control: (
              <DeviceModelFilter
                idPrefix={idPrefix}
                currentDeviceModelSlug={currentParams.device}
                onChange={(device) => onFilterChange({ device })}
              />
            ),
          })}

        {/* Structured-spec facets (TASK-191) — category-scoped (Матеріал,
            Колір…), each facet headed by its own legend. Left out with
            `hideSpecFacets` (TASK-523), with no category (TASK-515) or when
            the category has none. */}
        {hasSpecs &&
          renderSection({
            id: "specs",
            title: dict.filters.specsTitle,
            selected: specsSelected,
            onReset: () => onFilterChange({ specs: undefined }),
            hideTitle: true,
            control: (
              <SpecFacets
                categoryId={categoryId}
                currentParams={currentParams}
                onFilterChange={onFilterChange}
                idPrefix={idPrefix}
                cardClassName=""
                titleClassName="sr-only"
              />
            ),
          })}
      </section>

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
