"use client";

import { useEffect, useState } from "react";
import { useBrandControllerFindAll } from "@/entities/brand";
import { dict } from "@/shared/config";
import { Skeleton } from "@/shared/ui";
import { FilterCheckbox } from "./filter-checkbox";

/** Options shown before «Ще N» (Д3-2 Catalog §12). */
export const BRAND_OPTIONS_VISIBLE = 5;

interface BrandFilterProps {
  /** Currently selected brand SLUG (from `?brand=`), if any (TASK-420). */
  activeBrandSlug?: string;
  /**
   * Narrow the offered brands to those stocking something in this category
   * subtree (TASK-414). Omit on an unscoped catalogue to offer every brand.
   *
   * Still an ID, deliberately: `GET /brands?categoryId=` is a different endpoint
   * from the catalogue listing and was not part of the TASK-420 URL migration —
   * this value never reaches the address bar, and the parent already knows the
   * id because it holds the category tree.
   */
  categoryId?: string;
  /**
   * Select a brand (`undefined` = all brands). The caller writes the choice to
   * the `?brand=` URL param (a SLUG since TASK-420), combinable with the
   * category/price/search filters.
   */
  onSelect: (brandSlug: string | undefined) => void;
  /** Prefix for the checkboxes' DOM ids (the panel renders twice). */
  idPrefix?: string;
}

/**
 * BrandFilter (TASK-189) — the «Виробник» options of the filter panel: one
 * checkbox row per active brand, the first five and «Ще N» for the rest
 * (Д3-2 Catalog §12). The panel draws the section around it.
 *
 * ONE brand at a time: `?brand=` takes a single slug, so ticking another
 * brand replaces the selection and unticking clears it. Multi-select and the
 * per-brand facet counts the mockup draws need the API (`brand=a,b` and
 * counts on `GET /brands`) — until then the rows carry no count rather than a
 * made-up one.
 *
 * Scoped to the active category since TASK-414: the API narrows the list
 * (`GET /brands?categoryId=`) against the same subtree rollup the product
 * list uses, so the options and the grid can never disagree. While the list
 * is in flight the rows hold their place (TASK-515).
 */
export function BrandFilter({
  activeBrandSlug,
  categoryId,
  onSelect,
  idPrefix = "filter",
}: BrandFilterProps) {
  const { data, isSuccess, isPending } = useBrandControllerFindAll(
    categoryId ? { categoryId } : undefined,
  );
  const brands = data?.data ?? [];
  const [showAll, setShowAll] = useState(false);

  // Narrowing the list can strip out the brand that is currently selected —
  // switching category is the everyday way to hit it. Left alone, the URL would
  // keep filtering by an invisible brand and the grid would sit empty with no
  // control showing why. Gated on `isSuccess` so an in-flight (or failed)
  // request never clears a valid selection.
  const missingFromSlice =
    isSuccess &&
    Boolean(activeBrandSlug) &&
    !brands.some((brand) => brand.slug === activeBrandSlug);

  useEffect(() => {
    if (missingFromSlice) {
      onSelect(undefined);
    }
    // `onSelect` is a fresh closure on every render of the parent; depending on
    // it would re-fire this effect continuously. The guard above is the real
    // trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingFromSlice]);

  if (isPending) {
    return (
      <div
        aria-hidden="true"
        data-testid="brand-filter-pending"
        className="flex flex-col gap-1"
      >
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex h-8 items-center gap-3">
            <Skeleton className="size-5 rounded-md" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    );
  }

  if (brands.length === 0) {
    return null;
  }

  // The selected brand stays visible even when it sits past the fold.
  const visible = showAll
    ? brands
    : brands.filter(
        (brand, index) =>
          index < BRAND_OPTIONS_VISIBLE || brand.slug === activeBrandSlug,
      );
  const hiddenCount = brands.length - visible.length;

  return (
    <div className="flex flex-col">
      {visible.map((brand) => (
        <FilterCheckbox
          key={brand.id}
          id={`${idPrefix}-brand-${brand.slug}`}
          label={brand.name}
          checked={brand.slug === activeBrandSlug && !missingFromSlice}
          onCheckedChange={(checked) =>
            onSelect(checked ? brand.slug : undefined)
          }
        />
      ))}
      {(hiddenCount > 0 || showAll) &&
        brands.length > BRAND_OPTIONS_VISIBLE && (
          <button
            type="button"
            aria-expanded={showAll}
            onClick={() => setShowAll((previous) => !previous)}
            className="mt-1 self-start rounded-sm py-1 text-sm font-semibold text-muted-foreground underline-offset-3 transition-colors hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:transition-none"
          >
            {showAll
              ? dict.filters.fewerOptions
              : dict.filters.moreOptions(hiddenCount)}
          </button>
        )}
    </div>
  );
}
