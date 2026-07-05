"use client";

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
  /** Currently selected brand id (from `?brandId=`), if any. */
  activeBrandId?: string;
  /**
   * Select a brand (`undefined` = all brands). The caller writes the choice to
   * the `?brandId=` URL param, combinable with the category/price/search filters.
   */
  onSelect: (brandId: string | undefined) => void;
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
 */
export function BrandFilter({
  activeBrandId,
  onSelect,
  cardClassName,
  titleClassName,
}: BrandFilterProps) {
  const { data } = useBrandControllerFindAll();
  const brands = data?.data ?? [];

  if (brands.length === 0) {
    return null;
  }

  return (
    <div className={cardClassName}>
      <h3 className={titleClassName}>{dict.filters.brandTitle}</h3>
      <Select
        value={activeBrandId ? activeBrandId : ALL_BRANDS}
        onValueChange={(value) =>
          onSelect(value === ALL_BRANDS ? undefined : value)
        }
      >
        <SelectTrigger
          aria-label={dict.filters.brandTitle}
          className="h-[42px] w-full gap-2.5 rounded-[10px] border-[1.5px] border-border bg-card px-3 font-semibold text-foreground shadow-none hover:border-primary/40"
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
            <SelectItem key={brand.id} value={brand.id}>
              {brand.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
