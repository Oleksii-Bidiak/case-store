"use client";

import { useEffect, useRef, useState } from "react";
import { dict } from "@/shared/config";
import { formatMoney } from "@/shared/lib";
import { Input, Label, Slider } from "@/shared/ui";
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

interface PriceRangeFilterProps {
  /**
   * Prefix for the two inputs' DOM ids (`${idPrefix}-min-price` / `-max-price`).
   * Every filter panel renders twice (desktop aside + mobile drawer), so each
   * instance passes its own.
   */
  idPrefix: string;
  /** Committed lower bound (`undefined` = no lower bound). */
  committedMin?: number;
  /** Committed upper bound (`undefined` = no upper bound). */
  committedMax?: number;
  /**
   * Upper edge of the slider domain. The catalogue keeps the shop-wide
   * `PRICE_DOMAIN_MAX`; the wishlist passes its own highest saved price
   * (TASK-1300), so the thumbs span the prices that are actually there.
   */
  domainMax?: number;
  /**
   * Commit a range. A bound on its domain edge arrives as `undefined` («no
   * filter on this side»), so neither the URL nor client state ever carries a
   * bound that filters nothing.
   */
  onCommit: (updates: {
    minPrice: string | undefined;
    maxPrice: string | undefined;
  }) => void;
}

/**
 * The «Ціна, ₴» control: two number inputs over a two-thumb range slider, kept
 * in sync by one model (`model/price-range.ts`, TASK-208).
 *
 * Shared by the catalogue panel (URL-backed) and the wishlist rail (client
 * state, TASK-1300). Until the extraction the wishlist drew a decorative track
 * that only echoed the typed bounds; now both pages drag the same thumbs.
 *
 * Dragging mirrors into the inputs live and commits on release; typing commits
 * on blur. The inputs are focus-sensitive, so a change of the committed bounds
 * from OUTSIDE (a chip's ×, «Очистити все», a domain that shrank because the
 * priciest saved item was removed) re-seeds local state through a
 * `lastPushedRef`-guarded effect (docs/conventions/forms.md Rule 1b): our own
 * echo is ignored, and nothing is `key`-remounted.
 */
export function PriceRangeFilter({
  idPrefix,
  committedMin,
  committedMax,
  domainMax = PRICE_DOMAIN_MAX,
  onCommit,
}: PriceRangeFilterProps) {
  const min = clampPrice(committedMin ?? 0, domainMax);
  const max = clampPrice(committedMax ?? domainMax, domainMax);

  const [range, setRange] = useState<[number, number]>([min, max]);
  const [minText, setMinText] = useState(priceToInputText(min, 0));
  const [maxText, setMaxText] = useState(priceToInputText(max, domainMax));

  const lastPushedRef = useRef(rangeKey([min, max]));

  useEffect(() => {
    const next: [number, number] = [min, max];
    if (rangeKey(next) !== lastPushedRef.current) {
      lastPushedRef.current = rangeKey(next);
      setRange(next);
      setMinText(priceToInputText(min, 0));
      setMaxText(priceToInputText(max, domainMax));
    }
  }, [min, max, domainMax]);

  /** Commit a normalized range unless it matches the last commit. */
  const pushRange = (next: [number, number]) => {
    if (rangeKey(next) === lastPushedRef.current) return;
    lastPushedRef.current = rangeKey(next);
    onCommit(priceRangeToUrlUpdates(next, domainMax));
  };

  /** Mirror slider movement into the inputs live (while dragging). */
  const handleSliderChange = (next: number[]) => {
    const draft: [number, number] = [next[0], next[1]];
    setRange(draft);
    setMinText(priceToInputText(draft[0], 0));
    setMaxText(priceToInputText(draft[1], domainMax));
  };

  /**
   * Commit a typed bound (on blur): clamp/normalize both bounds — resolving an
   * inverted pair against the field the user edited — sync the slider and the
   * canonical input texts, then commit.
   */
  const handleInputCommit = (changed: "min" | "max") => {
    const next = normalizePriceRange(
      parsePriceInput(minText),
      parsePriceInput(maxText),
      changed,
      domainMax,
    );
    setRange(next);
    setMinText(priceToInputText(next[0], 0));
    setMaxText(priceToInputText(next[1], domainMax));
    pushRange(next);
  };

  return (
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
          // 42px field on the spacing scale; the stroke is the `Input`
          // primitive's own 1px `border-input` (no 1.5px width token — TASK-1605).
          className="h-10.5 rounded-md font-mono shadow-none"
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
          // 42px field on the spacing scale; the stroke is the `Input`
          // primitive's own 1px `border-input` (no 1.5px width token — TASK-1605).
          className="h-10.5 rounded-md font-mono shadow-none"
        />
      </div>
      {/* Draggable range slider (two thumbs). Mirrors the number inputs live
          while dragging and commits on release. */}
      <Slider
        value={range}
        min={0}
        max={domainMax}
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
    </>
  );
}
