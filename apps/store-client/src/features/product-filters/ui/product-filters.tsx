"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { ProductControllerFindAllParams } from "@/entities/product";
import { useBrandControllerFindAll } from "@/entities/brand";
import { useCategoryControllerGetFilterableSpecs } from "@/entities/category";
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
import { BrandFilter } from "./brand-filter";
import { DeviceModelFilter } from "./device-model-filter";
import { SpecFacets } from "./spec-facets";

interface ProductFiltersProps {
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
  /**
   * Render each section as a native `<details>` disclosure (TASK-084 — mobile
   * drawer polish). Opt-in: only the mobile Sheet passes it, so the desktop
   * `<aside>` keeps its always-expanded layout unchanged. A section defaults
   * open when it currently holds an active filter value, closed otherwise, so a
   * returning user sees what's applied without scrolling five full cards.
   */
  collapsible?: boolean;
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
  onFilterChange,
  idPrefix = "filter",
  collapsible = false,
}: ProductFiltersProps) {
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

  // The filters this panel owns (search + brand + price) — the category
  // selection lives in the chips row and is cleared there, not from the sidebar.
  const hasActiveFilters = Boolean(
    currentParams.search ||
    currentParams.brandId ||
    currentParams.minPrice != null ||
    currentParams.maxPrice != null,
  );

  // Presence gates for the collapsible mobile drawer only: BrandFilter and
  // SpecFacets self-hide (return null) when they have no data, but a `<details>`
  // wrapper would still show a bare header. So in collapsible mode we mirror
  // their own emptiness check here to skip the disclosure entirely. Both hooks
  // are deduped by React Query (the list view already fetches brands; SpecFacets
  // itself refetches the same key) and are gated off on desktop.
  const { data: brandsData } = useBrandControllerFindAll({
    query: { enabled: collapsible },
  });
  const hasBrands = (brandsData?.data.length ?? 0) > 0;
  const { data: specsData } = useCategoryControllerGetFilterableSpecs(
    currentParams.categoryId ?? "",
    { query: { enabled: collapsible && Boolean(currentParams.categoryId) } },
  );
  const hasSpecs =
    Boolean(currentParams.categoryId) && (specsData?.data.length ?? 0) > 0;

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

      {/* Manufacturer (brand) filter — TASK-189. Hidden when no brands exist.
          Collapsible drawer gates on `hasBrands` and strips BrandFilter's own
          card chrome (the <details> provides it); desktop keeps its self-card. */}
      {collapsible ? (
        hasBrands &&
        renderSection(
          dict.filters.brandTitle,
          <BrandFilter
            activeBrandId={currentParams.brandId}
            onSelect={(brandId) => onFilterChange({ brandId })}
            cardClassName=""
            titleClassName="sr-only"
          />,
          Boolean(currentParams.brandId),
        )
      ) : (
        <BrandFilter
          activeBrandId={currentParams.brandId}
          onSelect={(brandId) => onFilterChange({ brandId })}
          cardClassName={cardClass}
          titleClassName={`${cardTitleClass} mb-4`}
        />
      )}

      {/* Device compatibility (TASK-190) — brand → model cascade */}
      {renderSection(
        dict.filters.deviceTitle,
        <DeviceModelFilter
          currentDeviceModelId={currentParams.deviceModelId}
          onChange={(deviceModelId) => onFilterChange({ deviceModelId })}
        />,
        Boolean(currentParams.deviceModelId),
      )}

      {/* Price range */}
      {renderSection(
        dict.filters.priceTitle,
        <>
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
              className="h-[42px] rounded-md border-[1.5px] font-mono shadow-none"
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
              className="h-[42px] rounded-md border-[1.5px] font-mono shadow-none"
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
        </>,
        currentParams.minPrice != null || currentParams.maxPrice != null,
      )}

      {/* Structured-spec facets (TASK-191) — category-scoped; renders nothing
          when no category is active or it has no filterable specs. Collapsible
          drawer gates on `hasSpecs` and strips the facet card's own chrome. */}
      {collapsible ? (
        hasSpecs &&
        renderSection(
          dict.filters.specsTitle,
          <SpecFacets
            categoryId={currentParams.categoryId}
            specs={currentParams.specs}
            onFilterChange={onFilterChange}
            idPrefix={idPrefix}
            cardClassName=""
            titleClassName="sr-only"
          />,
          Boolean(currentParams.specs),
        )
      ) : (
        <SpecFacets
          categoryId={currentParams.categoryId}
          specs={currentParams.specs}
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
          onClick={() =>
            onFilterChange({
              search: undefined,
              brandId: undefined,
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
