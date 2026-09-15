"use client";

import { Search, X } from "lucide-react";
import type { ProductControllerFindAllParams } from "@/entities/product";
import { useDeviceControllerFindModels } from "@/entities/device";
import { useCategoryControllerGetFilterableSpecs } from "@/entities/category";
import { formatMoney } from "@/shared/lib";
import { dict } from "@/shared/config";
import {
  formatFacetChipLabel,
  parseSpecParam,
  removeSpecValue,
} from "../model/spec-facet";
import { clearFilterUpdates } from "../model/active-filters";
import { toFacetQueryParams } from "../model/facet-query";

interface ActiveFilterChipsProps {
  currentParams: ProductControllerFindAllParams;
  /**
   * Display name for the active brand (`?brand=`), resolved by the parent from
   * the brand list. When absent the brand chip is not rendered even if a
   * `brand` slug is set (e.g. the list is still loading).
   */
  brandName?: string;
  /**
   * Active category id, used ONLY to resolve spec-facet labels (TASK-488). The
   * URL carries `?specs=magsafe:true`, which without the category's facet list
   * would render a chip labelled «true».
   */
  categoryId?: string;
  /**
   * The compatible device is fixed by the route — `/catalog/[category]/[device]`
   * (TASK-490). No device chip is rendered (removing it would contradict the
   * URL, the H1 and the canonical), and «скинути всі» leaves it in place, the
   * same way it already leaves a locked category's.
   */
  lockedDevice?: boolean;
  onFilterChange: (updates: Record<string, string | undefined>) => void;
}

/**
 * ActiveFilterChips — a removable pill per active filter (search, min/max
 * price), shown above the product grid. Each chip's × clears just that filter;
 * a trailing "clear all" clears every filter at once (including the category,
 * whose visible control is the `CategoryChips` row since TASK-216 — it is not
 * duplicated here). The search chip is highlighted in the brand colour and
 * carries a search glyph.
 */
export function ActiveFilterChips({
  currentParams,
  brandName,
  categoryId,
  lockedDevice = false,
  onFilterChange,
}: ActiveFilterChipsProps) {
  // The facet list of the active category, for chip labels only (TASK-488).
  // Deduped by React Query with the sidebar's own call, and not fired at all
  // until there is both a category and something selected to label.
  const { data: facetsData } = useCategoryControllerGetFilterableSpecs(
    categoryId ?? "",
    // The SAME params the sidebar sends (TASK-489) — the labels come free off
    // the request it already makes, and a different param set here would be a
    // second request fetching the same definitions.
    toFacetQueryParams(currentParams),
    {
      query: { enabled: Boolean(categoryId) && Boolean(currentParams.specs) },
    },
  );
  const definitionByKey = new Map(
    (facetsData?.data ?? []).map((facet) => [
      facet.definition.key,
      facet.definition,
    ]),
  );

  // Resolve the selected device model's name for its chip label (TASK-190).
  // Only fires when a device filter is active AND removable — on a compat
  // landing page the device is the route, so there is no chip and no lookup.
  // Keyed by SLUG since TASK-420 — `?device=iphone-15`.
  const deviceSlug = lockedDevice ? undefined : currentParams.device;
  const { data: modelsData } = useDeviceControllerFindModels(undefined, {
    query: { enabled: Boolean(deviceSlug) },
  });
  const deviceModel = modelsData?.data.find((m) => m.slug === deviceSlug);

  const chips: {
    key: string;
    label: string;
    isSearch?: boolean;
    clear: () => void;
  }[] = [];

  if (currentParams.search) {
    chips.push({
      key: "search",
      label: `«${currentParams.search}»`,
      isSearch: true,
      clear: () => onFilterChange({ search: undefined }),
    });
  }

  if (currentParams.brand && brandName) {
    chips.push({
      key: "brand",
      label: `${dict.filters.brandTitle}: ${brandName}`,
      clear: () => onFilterChange({ brand: undefined }),
    });
  }

  if (currentParams.minPrice != null) {
    chips.push({
      key: "minPrice",
      label: `${dict.filters.minPlaceholder}: ${formatMoney(String(currentParams.minPrice))}`,
      clear: () => onFilterChange({ minPrice: undefined }),
    });
  }

  if (currentParams.maxPrice != null) {
    chips.push({
      key: "maxPrice",
      label: `${dict.filters.maxPlaceholder}: ${formatMoney(String(currentParams.maxPrice))}`,
      clear: () => onFilterChange({ maxPrice: undefined }),
    });
  }

  if (deviceSlug) {
    chips.push({
      key: "device",
      label: `${dict.filters.deviceLabel}: ${deviceModel?.name ?? "…"}`,
      clear: () => onFilterChange({ device: undefined }),
    });
  }

  if (currentParams.inStock === true) {
    chips.push({
      key: "inStock",
      label: dict.filters.inStockChip,
      clear: () => onFilterChange({ inStock: undefined }),
    });
  }

  // Structured-spec facet chips (TASK-191; one chip PER SELECTED VALUE since
  // TASK-414). With multi-select a single "specs" chip would be the only way to
  // undo an entire many-facet selection — clicking × to drop one unwanted value
  // would silently drop the other five. Each chip now removes just its own
  // value and leaves the rest of the param intact.
  for (const facet of parseSpecParam(currentParams.specs)) {
    for (const value of facet.values) {
      chips.push({
        key: `specs:${facet.key}:${value}`,
        label: formatFacetChipLabel(value, definitionByKey.get(facet.key)),
        clear: () =>
          onFilterChange({
            specs: removeSpecValue(currentParams.specs, facet.key, value),
          }),
      });
    }
  }

  if (chips.length === 0) {
    return null;
  }

  return (
    <div className="mb-5 flex min-h-[34px] flex-wrap items-center gap-2.5">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.clear}
          className={`inline-flex h-[34px] items-center gap-2 rounded-full border py-0 pr-2 pl-3.5 text-[13.5px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
            chip.isSearch
              ? "border-primary/30 bg-primary/10 text-primary"
              : "border-border bg-card text-foreground hover:border-primary/40"
          }`}
        >
          {chip.isSearch && <Search className="size-3.5" aria-hidden="true" />}
          {chip.label}
          <span
            aria-hidden="true"
            className={`inline-flex size-[18px] items-center justify-center rounded-full ${
              chip.isSearch
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            <X className="size-[11px]" strokeWidth={3} />
          </span>
          <span className="sr-only">{dict.filters.removeFilter}</span>
        </button>
      ))}
      <button
        type="button"
        // The full set, from the one shared definition (TASK-414). On a locked
        // category landing page `category` is not in the URL query at all, so
        // clearing it there is a harmless no-op — the route keeps the category.
        // A locked DEVICE is excluded for the same reason and with the same
        // usual no-op: the compat page's clean URL carries no `?device=` either
        // (the route segment supplies it). The exclusion earns its keep on the
        // one URL where it is NOT a no-op — a hand-edited
        // `/catalog/chohly/iphone-15-pro?device=…`, where a blanket clear would
        // rewrite the query out from under a heading that still says otherwise.
        onClick={() =>
          onFilterChange(clearFilterUpdates({ includeDevice: !lockedDevice }))
        }
        className="text-[13.5px] font-semibold text-muted-foreground underline decoration-1 underline-offset-[3px] outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        {dict.filters.clearAll}
      </button>
    </div>
  );
}
