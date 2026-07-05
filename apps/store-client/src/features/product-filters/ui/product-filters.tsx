"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import type { CategoryEntity } from "@/entities/category";
import type { ProductControllerFindAllParams } from "@/entities/product";
import { dict } from "@/shared/config";
import { formatMoney } from "@/shared/lib";
import { Button, Input, Label, Slider } from "@/shared/ui";
import {
  PRICE_DOMAIN_MAX,
  PRICE_STEP,
  clampPrice,
  normalizePriceRange,
  parsePriceInput,
  priceRangeToUrlUpdates,
  priceToInputText,
  rangeKey,
} from "../model/price-range";
import { SearchInput } from "./search-input";

interface ProductFiltersProps {
  /** Root categories used to populate the category selector. */
  categories: CategoryEntity[];
  /** Currently-active filter params (derived from the URL). */
  currentParams: ProductControllerFindAllParams;
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
}

const cardClass =
  "rounded-2xl border border-border bg-card p-[18px] shadow-[var(--shadow-card)]";
const cardTitleClass =
  "font-display text-[15px] font-bold tracking-tight text-card-foreground";

/**
 * Filter panel for the product list page, styled as stacked cards (keyword
 * search, category, price). Each control writes its change back to the URL via
 * `onFilterChange`; sorting and the grid/list toggle live in the page toolbar.
 */
export function ProductFilters({
  categories,
  currentParams,
  onFilterChange,
  idPrefix = "filter",
}: ProductFiltersProps) {
  const activeCategory = currentParams.categoryId;

  // Committed price bounds from the URL, clamped into the slider domain.
  const committedMin = clampPrice(currentParams.minPrice ?? 0);
  const committedMax = clampPrice(currentParams.maxPrice ?? PRICE_DOMAIN_MAX);

  // Draft price state shared by the slider and the min/max inputs (TASK-208):
  // `range` drives the thumbs, `minText`/`maxText` drive the (controlled)
  // inputs. Dragging mirrors into the texts live; typing commits into `range`
  // on blur — the same moment the URL is written, matching the old behaviour.
  const [range, setRange] = useState<[number, number]>([
    committedMin,
    committedMax,
  ]);
  const [minText, setMinText] = useState(priceToInputText(committedMin, 0));
  const [maxText, setMaxText] = useState(
    priceToInputText(committedMax, PRICE_DOMAIN_MAX),
  );

  // The inputs are focus-sensitive (the user types in them), so external URL
  // changes re-seed local state via a `lastPushedRef`-guarded effect
  // (docs/conventions/forms.md Rule 1b) — our own URL echo is ignored, and the
  // inputs are never `key`-remounted.
  const lastPushedRef = useRef(rangeKey([committedMin, committedMax]));

  useEffect(() => {
    const next: [number, number] = [committedMin, committedMax];
    if (rangeKey(next) !== lastPushedRef.current) {
      lastPushedRef.current = rangeKey(next);
      setRange(next);
      setMinText(priceToInputText(committedMin, 0));
      setMaxText(priceToInputText(committedMax, PRICE_DOMAIN_MAX));
    }
  }, [committedMin, committedMax]);

  /** Push a normalized range to the URL unless it matches the last push. */
  const pushRange = (next: [number, number]) => {
    if (rangeKey(next) === lastPushedRef.current) return;
    lastPushedRef.current = rangeKey(next);
    onFilterChange(priceRangeToUrlUpdates(next));
  };

  /** Mirror slider movement into the inputs live (while dragging). */
  const handleSliderChange = (next: number[]) => {
    const draft: [number, number] = [next[0], next[1]];
    setRange(draft);
    setMinText(priceToInputText(draft[0], 0));
    setMaxText(priceToInputText(draft[1], PRICE_DOMAIN_MAX));
  };

  /**
   * Commit a typed bound (on blur): clamp/normalize both bounds — resolving an
   * inverted pair against the field the user edited — sync the slider and the
   * canonical input texts, then write the URL.
   */
  const handleInputCommit = (changed: "min" | "max") => {
    const next = normalizePriceRange(
      parsePriceInput(minText),
      parsePriceInput(maxText),
      changed,
    );
    setRange(next);
    setMinText(priceToInputText(next[0], 0));
    setMaxText(priceToInputText(next[1], PRICE_DOMAIN_MAX));
    pushRange(next);
  };

  const hasActiveFilters = Boolean(
    currentParams.categoryId ||
    currentParams.search ||
    currentParams.minPrice != null ||
    currentParams.maxPrice != null,
  );

  return (
    <div className="flex flex-col gap-3.5">
      {/* Keyword search */}
      <div className={cardClass}>
        <SearchInput
          id={`${idPrefix}-search`}
          initialValue={currentParams.search ?? ""}
          onSearch={(value) => onFilterChange({ search: value })}
        />
      </div>

      {/* Category */}
      {categories.length > 0 && (
        <div className={cardClass}>
          <h3 className={`${cardTitleClass} mb-3`}>{dict.filters.category}</h3>
          <div className="flex flex-col">
            {categories.map((category) => {
              const active = category.id === activeCategory;
              return (
                <button
                  key={category.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    onFilterChange({
                      categoryId: active ? undefined : category.id,
                    })
                  }
                  className="flex items-center gap-3 rounded-md py-2 text-left text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    aria-hidden="true"
                    className={`flex size-5 shrink-0 items-center justify-center rounded-md border-[1.5px] transition-colors ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-transparent"
                    }`}
                  >
                    {active && <Check className="size-3.5" strokeWidth={3} />}
                  </span>
                  <span className={`flex-1 ${active ? "font-semibold" : ""}`}>
                    {category.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Price range */}
      <div className={cardClass}>
        <h3 className={`${cardTitleClass} mb-4`}>{dict.filters.priceTitle}</h3>
        <div className="flex items-center gap-2.5">
          <Label htmlFor={`${idPrefix}-min-price`} className="sr-only">
            {dict.filters.minPrice}
          </Label>
          <Input
            id={`${idPrefix}-min-price`}
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            placeholder={dict.filters.minPlaceholder}
            value={minText}
            onChange={(event) => setMinText(event.target.value)}
            onBlur={() => handleInputCommit("min")}
            className="h-[42px] rounded-[10px] border-[1.5px] font-mono shadow-none"
          />
          <span aria-hidden="true" className="text-muted-foreground">
            —
          </span>
          <Label htmlFor={`${idPrefix}-max-price`} className="sr-only">
            {dict.filters.maxPrice}
          </Label>
          <Input
            id={`${idPrefix}-max-price`}
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            placeholder={dict.filters.maxPlaceholder}
            value={maxText}
            onChange={(event) => setMaxText(event.target.value)}
            onBlur={() => handleInputCommit("max")}
            className="h-[42px] rounded-[10px] border-[1.5px] font-mono shadow-none"
          />
        </div>
        {/* Draggable range slider (two thumbs). Mirrors the number inputs live
            while dragging and writes minPrice/maxPrice to the URL on release. */}
        <Slider
          value={range}
          min={0}
          max={PRICE_DOMAIN_MAX}
          step={PRICE_STEP}
          minStepsBetweenThumbs={1}
          onValueChange={handleSliderChange}
          onValueCommit={(next) => pushRange([next[0], next[1]])}
          thumbLabels={[dict.filters.minPrice, dict.filters.maxPrice]}
          aria-label={dict.filters.priceSliderAria}
          className="mt-4"
        />
        <div
          aria-hidden="true"
          className="mt-2.5 flex justify-between font-mono text-xs text-muted-foreground"
        >
          <span>{formatMoney(String(range[0]))}</span>
          <span>{formatMoney(String(range[1]))}</span>
        </div>
      </div>

      {hasActiveFilters && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start text-muted-foreground hover:text-foreground"
          onClick={() =>
            onFilterChange({
              categoryId: undefined,
              search: undefined,
              minPrice: undefined,
              maxPrice: undefined,
            })
          }
        >
          {dict.filters.clear}
        </Button>
      )}
    </div>
  );
}
