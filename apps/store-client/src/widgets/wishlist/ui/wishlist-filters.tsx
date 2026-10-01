"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { WishlistItemEntity } from "@/entities/wishlist";
import { FilterCheckbox, PriceRangeFilter } from "@/features/product-filters";
import { dict } from "@/shared/config";
import {
  FACET_VISIBLE_COUNT,
  isInStock,
  isOnSale,
  type FacetOption,
  type WishlistFilterState,
} from "../model/wishlist-catalog";

interface WishlistFiltersProps {
  /** All saved items (used only to show per-filter counts). */
  items: readonly WishlistItemEntity[];
  /** Categories present in the list, most frequent first. */
  categoryOptions: readonly FacetOption[];
  /** Brands present in the list, most frequent first. */
  brandOptions: readonly FacetOption[];
  /** Upper edge of the price slider (the priciest saved item, rounded up). */
  priceDomain: number;
  value: WishlistFilterState;
  onChange: (next: WishlistFilterState) => void;
  /** Distinct DOM ids per instance (desktop aside + mobile drawer). */
  idPrefix?: string;
  /**
   * Render each section as a native `<details>` disclosure — the same mechanism
   * the catalog filter drawer uses (TASK-084). Opt-in: only the mobile Sheet
   * passes it, so the desktop `<aside>` keeps its always-expanded cards. A
   * section defaults open when it currently holds an active filter value, closed
   * otherwise, so a returning user sees what's applied without scrolling.
   */
  collapsible?: boolean;
}

// The mockup's 18px section padding is on the spacing scale (`p-4.5`); its
// 15px title is not on the type scale (TASK-1604), so the title takes the next
// step up and stays above the 14px rows.
const cardClass = "rounded-2xl border border-border bg-card p-4.5 shadow-card";
const cardTitle = "font-display text-base font-bold text-card-foreground";

/** Toggle `id` in a list of ticked ids. */
function toggleId(ids: readonly string[], id: string, on: boolean): string[] {
  return on ? [...ids, id] : ids.filter((existing) => existing !== id);
}

interface FacetCheckboxListProps {
  idPrefix: string;
  options: readonly FacetOption[];
  selected: readonly string[];
  onToggle: (id: string, checked: boolean) => void;
}

/**
 * The checkbox rows of one facet (category, brand) with counts. Past
 * `FACET_VISIBLE_COUNT` rows the rest fold behind «Показати всі (N)» — a
 * disclosure button (`aria-expanded`/`aria-controls`) — but a ticked value is
 * never folded away: a hidden active filter is one the shopper cannot see why
 * the grid is narrow, nor untick.
 */
function FacetCheckboxList({
  idPrefix,
  options,
  selected,
  onToggle,
}: FacetCheckboxListProps) {
  const [expanded, setExpanded] = useState(false);
  const foldable = options.length > FACET_VISIBLE_COUNT;
  const shown =
    expanded || !foldable
      ? options
      : options.filter(
          (option, index) =>
            index < FACET_VISIBLE_COUNT || selected.includes(option.id),
        );
  const listId = `${idPrefix}-list`;

  return (
    <>
      <div id={listId} className="flex flex-col">
        {shown.map((option) => (
          <FilterCheckbox
            key={option.id}
            id={`${idPrefix}-${option.id}`}
            label={option.label}
            count={option.count}
            checked={selected.includes(option.id)}
            onCheckedChange={(checked) => onToggle(option.id, checked)}
          />
        ))}
      </div>
      {foldable && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((open) => !open)}
          className="mt-2 rounded-sm text-sm font-semibold text-muted-foreground underline underline-offset-2 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          {expanded
            ? dict.wishlist.showFewerFacets
            : dict.wishlist.showAllFacets(options.length)}
        </button>
      )}
    </>
  );
}

/**
 * WishlistFilters — the `/wishlist` rail, «каталог №2» (TASK-1300): the same
 * cards as the catalogue's panel, all client-side over the saved items.
 *
 *  - «Обирай швидко»: «Зі знижкою» / «В наявності», from each item's
 *    compareAtPrice / maxQty;
 *  - «Категорія» and «Виробник»: checkboxes with counts, from the product cards
 *    the view fetched for these ids (the wishlist summary carries neither); a
 *    section with no values is not rendered at all;
 *  - «Ціна, ₴»: the catalogue's inputs + two-thumb slider (`PriceRangeFilter`)
 *    over the list's own price domain.
 *
 * «Сумісний пристрій» from the mockup is left out on purpose: no data source
 * carries compatibility for these items (see `useWishlistFacets`), and a
 * control that filters nothing is worse than none.
 */
export function WishlistFilters({
  items,
  categoryOptions,
  brandOptions,
  priceDomain,
  value,
  onChange,
  idPrefix = "wl",
  collapsible = false,
}: WishlistFiltersProps) {
  const saleCount = items.filter(isOnSale).length;
  const stockCount = items.filter(isInStock).length;

  /**
   * Render one filter section's chrome. In `collapsible` mode it is a native
   * `<details>` card (summary = title + rotating chevron, no JS state — `<details
   * open>` is the single source of truth), mirroring the catalog filter drawer
   * (TASK-084); otherwise the always-expanded card `<div>` (desktop unchanged).
   */
  const renderSection = (
    title: string,
    control: ReactNode,
    activeDefaultOpen: boolean,
  ) => {
    if (!collapsible) {
      return (
        <div className={cardClass}>
          <h3 className={`${cardTitle} mb-3.5`}>{title}</h3>
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
          aria-label={dict.filters.sectionToggleAria(title)}
          className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-2xl p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset [&::-webkit-details-marker]:hidden"
        >
          <span className={cardTitle}>{title}</span>
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
      {renderSection(
        dict.wishlist.quickTitle,
        <div className="flex flex-col">
          <FilterCheckbox
            id={`${idPrefix}-sale`}
            label={dict.wishlist.quickSale}
            count={saleCount}
            checked={value.saleOnly}
            onCheckedChange={(checked) =>
              onChange({ ...value, saleOnly: checked })
            }
          />
          <FilterCheckbox
            id={`${idPrefix}-stock`}
            label={dict.wishlist.quickInStock}
            count={stockCount}
            checked={value.inStockOnly}
            onCheckedChange={(checked) =>
              onChange({ ...value, inStockOnly: checked })
            }
          />
        </div>,
        value.saleOnly || value.inStockOnly,
      )}

      {categoryOptions.length > 0 &&
        renderSection(
          dict.wishlist.categoryTitle,
          <FacetCheckboxList
            idPrefix={`${idPrefix}-cat`}
            options={categoryOptions}
            selected={value.categoryIds}
            onToggle={(id, checked) =>
              onChange({
                ...value,
                categoryIds: toggleId(value.categoryIds, id, checked),
              })
            }
          />,
          value.categoryIds.length > 0,
        )}

      {brandOptions.length > 0 &&
        renderSection(
          dict.filters.brandTitle,
          <FacetCheckboxList
            idPrefix={`${idPrefix}-brand`}
            options={brandOptions}
            selected={value.brandIds}
            onToggle={(id, checked) =>
              onChange({
                ...value,
                brandIds: toggleId(value.brandIds, id, checked),
              })
            }
          />,
          value.brandIds.length > 0,
        )}

      {renderSection(
        dict.filters.priceTitle,
        <PriceRangeFilter
          idPrefix={idPrefix}
          committedMin={value.minPrice}
          committedMax={value.maxPrice}
          domainMax={priceDomain}
          onCommit={({ minPrice, maxPrice }) =>
            onChange({
              ...value,
              minPrice: minPrice != null ? Number(minPrice) : undefined,
              maxPrice: maxPrice != null ? Number(maxPrice) : undefined,
            })
          }
        />,
        value.minPrice != null || value.maxPrice != null,
      )}
    </div>
  );
}
