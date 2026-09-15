"use client";

import { useEffect } from "react";
import { Factory } from "lucide-react";
import { useBrandControllerFindAll } from "@/entities/brand";
import { dict } from "@/shared/config";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui";

/** Radix Select forbids an empty-string item value; this stands in for "all brands". */
const ALL_BRANDS = "__all_brands__";

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
  /** Class applied to the outer card wrapper (matches the sibling filter cards). */
  cardClassName?: string;
  /** Class applied to the card title. */
  titleClassName?: string;
}

/**
 * BrandFilter (TASK-189) — a "Виробник" dropdown card for the catalog filter
 * panel. Lists the active brands from `GET /brands`; a leading "Всі виробники"
 * option clears the selection. Renders nothing (no empty card) while there are
 * no brands — same empty-state convention as `CategoryChips`.
 *
 * Scoped to the active category since TASK-414. Before that the dropdown listed
 * every brand in the shop regardless of where the shopper was standing, so
 * inside a category stocking two makes it offered a dozen — and picking one of
 * the others produced a guaranteed-empty grid. The API does the narrowing
 * (`GET /brands?categoryId=`) against the same subtree rollup the product list uses, so the
 * dropdown and the grid can never disagree.
 */
export function BrandFilter({
  activeBrandSlug,
  categoryId,
  onSelect,
  cardClassName,
  titleClassName,
}: BrandFilterProps) {
  const { data, isSuccess } = useBrandControllerFindAll(
    categoryId ? { categoryId } : undefined,
  );
  const brands = data?.data ?? [];

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

  if (brands.length === 0) {
    return null;
  }

  return (
    <div className={cardClassName}>
      <h3 className={titleClassName}>{dict.filters.brandTitle}</h3>
      <Select
        value={
          activeBrandSlug && !missingFromSlice ? activeBrandSlug : ALL_BRANDS
        }
        onValueChange={(value) =>
          onSelect(value === ALL_BRANDS ? undefined : value)
        }
      >
        <SelectTrigger
          aria-label={dict.filters.brandTitle}
          className="h-[42px] w-full gap-2.5 rounded-md border-[1.5px] border-border bg-card px-3 font-semibold text-foreground shadow-none hover:border-primary/40"
        >
          <Factory
            className="size-4 text-muted-foreground"
            aria-hidden="true"
          />
          <SelectValue placeholder={dict.filters.allBrands} />
        </SelectTrigger>
        <SelectContent className="rounded-xl">
          <SelectItem value={ALL_BRANDS}>{dict.filters.allBrands}</SelectItem>
          {brands.map((brand) => (
            <SelectItem key={brand.id} value={brand.slug}>
              {brand.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
