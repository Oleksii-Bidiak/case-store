"use client";

import { Check } from "lucide-react";
import type { WishlistItemEntity } from "@/entities/wishlist";
import { Input, Label } from "@/shared/ui";
import { dict } from "@/shared/config";

export interface WishlistFilterState {
  saleOnly: boolean;
  inStockOnly: boolean;
  minPrice: string;
  maxPrice: string;
}

export const EMPTY_WISHLIST_FILTERS: WishlistFilterState = {
  saleOnly: false,
  inStockOnly: false,
  minPrice: "",
  maxPrice: "",
};

export function isOnSale(item: WishlistItemEntity): boolean {
  return (
    item.compareAtPrice != null &&
    Number(item.compareAtPrice) > Number(item.price)
  );
}

export function isInStock(item: WishlistItemEntity): boolean {
  // The API exposes the capped orderable quantity (maxQty), never the raw
  // stock figure (TASK-231); 0 means the position is out of stock.
  return item.maxQty > 0 && item.isActive;
}

interface WishlistFiltersProps {
  /** All saved items (used only to show per-filter counts). */
  items: WishlistItemEntity[];
  value: WishlistFilterState;
  onChange: (next: WishlistFilterState) => void;
  /** Distinct DOM ids per instance (desktop aside + mobile drawer). */
  idPrefix?: string;
}

const cardClass =
  "rounded-2xl border border-border bg-card p-[18px] shadow-card";
const cardTitle =
  "mb-3.5 font-display text-[15px] font-bold text-card-foreground";

/** Highest saved price, rounded up — the domain for the display-only track. */
function priceDomain(items: WishlistItemEntity[]): number {
  const max = items.reduce((m, i) => Math.max(m, Number(i.price)), 0);
  return Math.max(1000, Math.ceil(max / 1000) * 1000);
}

function clampPct(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/**
 * WishlistFilters — the wishlist sidebar (quick filters + price). All real,
 * client-side over the already-fetched saved items: "Зі знижкою" and "В
 * наявності" derive from each item's compareAtPrice/maxQty, and the price bounds
 * filter by the item price. Brand is intentionally omitted (the wishlist item
 * carries no brand — TASK-176), so no dead control is shown.
 */
export function WishlistFilters({
  items,
  value,
  onChange,
  idPrefix = "wl",
}: WishlistFiltersProps) {
  const saleCount = items.filter(isOnSale).length;
  const stockCount = items.filter(isInStock).length;

  const domain = priceDomain(items);
  const min = value.minPrice ? Number(value.minPrice) : 0;
  const max = value.maxPrice ? Number(value.maxPrice) : domain;
  const trackLeft = clampPct((min / domain) * 100);
  const trackRight = clampPct(((domain - max) / domain) * 100);

  const quick = [
    {
      key: "saleOnly" as const,
      label: dict.wishlist.quickSale,
      on: value.saleOnly,
      count: saleCount,
    },
    {
      key: "inStockOnly" as const,
      label: dict.wishlist.quickInStock,
      on: value.inStockOnly,
      count: stockCount,
    },
  ];

  return (
    <div className="flex flex-col gap-3.5">
      {/* Quick filters */}
      <div className={cardClass}>
        <h3 className={cardTitle}>{dict.wishlist.quickTitle}</h3>
        {quick.map((q) => (
          <label
            key={q.key}
            className="flex cursor-pointer items-center gap-3 py-2 text-sm text-foreground"
          >
            <input
              type="checkbox"
              className="peer sr-only"
              checked={q.on}
              onChange={() => onChange({ ...value, [q.key]: !q.on })}
            />
            <span
              aria-hidden="true"
              className={`flex size-5 shrink-0 items-center justify-center rounded-md border-[1.5px] transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 ${
                q.on
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-transparent"
              }`}
            >
              {q.on && <Check className="size-3.5" strokeWidth={3} />}
            </span>
            <span className={`flex-1 ${q.on ? "font-semibold" : ""}`}>
              {q.label}
            </span>
            <span className="font-mono text-[13px] text-muted-foreground">
              {q.count}
            </span>
          </label>
        ))}
      </div>

      {/* Price */}
      <div className={cardClass}>
        <h3 className={cardTitle}>{dict.filters.priceTitle}</h3>
        <div className="flex items-center gap-2.5">
          <Label htmlFor={`${idPrefix}-min`} className="sr-only">
            {dict.filters.minPrice}
          </Label>
          <Input
            id={`${idPrefix}-min`}
            type="number"
            min="0"
            inputMode="numeric"
            placeholder={dict.filters.minPlaceholder}
            value={value.minPrice}
            onChange={(e) => onChange({ ...value, minPrice: e.target.value })}
            className="h-[42px] rounded-md border-[1.5px] font-mono shadow-none"
          />
          <span aria-hidden="true" className="text-muted-foreground">
            —
          </span>
          <Label htmlFor={`${idPrefix}-max`} className="sr-only">
            {dict.filters.maxPrice}
          </Label>
          <Input
            id={`${idPrefix}-max`}
            type="number"
            min="0"
            inputMode="numeric"
            placeholder={dict.filters.maxPlaceholder}
            value={value.maxPrice}
            onChange={(e) => onChange({ ...value, maxPrice: e.target.value })}
            className="h-[42px] rounded-md border-[1.5px] font-mono shadow-none"
          />
        </div>
        {/* Display-only track reflecting the entered bounds (mirrors the design). */}
        <div aria-hidden="true" className="relative mt-3.5 h-[30px]">
          <div className="absolute top-[13px] right-0 left-0 h-1 rounded-full bg-muted" />
          <div
            className="absolute top-[13px] h-1 rounded-full bg-primary"
            style={{ left: `${trackLeft}%`, right: `${trackRight}%` }}
          />
        </div>
      </div>
    </div>
  );
}
