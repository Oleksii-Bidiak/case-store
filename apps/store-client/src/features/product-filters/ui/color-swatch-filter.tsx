"use client";

import { Check } from "lucide-react";
import { colorSwatch } from "@/shared/lib";

interface ColorSwatchFilterProps {
  /** Ids are built by the caller so the facet's `<fieldset>` can own the prefix. */
  idPrefix: string;
  /** Every colour offered by this category, in the order the API returned them. */
  values: string[];
  /** Colours currently ticked in the URL. */
  selected: string[];
  onToggle: (value: string) => void;
}

/**
 * ColorSwatchFilter — the catalogue's colour facet, rendered as swatches
 * (TASK-487, owner decision B-10: colour is the strongest facet in accessories).
 *
 * ── Why this is not just `FilterCheckbox` with a dot ────────────────────────
 * A colour list is the one facet a shopper SCANS rather than reads. Twelve
 * stacked checkbox rows push every other filter below the fold, and the thing
 * being chosen — the colour — is the smallest mark on the row. So the values
 * wrap into a grid of swatch chips instead.
 *
 * ── a11y: colour is never the only channel ──────────────────────────────────
 * Each chip is a REAL `<input type="checkbox">` inside a `<label>`, `sr-only`
 * rather than hidden, so Tab reaches it, Space toggles it and a screen reader
 * announces the checked state with no ARIA of our own — the same construction
 * `FilterCheckbox` uses and for the same reasons. The colour NAME is rendered
 * next to the swatch, visibly: a shopper who cannot distinguish «Сірий» from
 * «Графітовий» by the dot, or at all, still reads the word. The dot itself is
 * `aria-hidden`, so the name is announced once rather than twice.
 *
 * The swatch colour comes from `colorSwatch()`, which maps free-text UA/EN
 * colour names to a CSS colour and falls back to a neutral gradient it cannot
 * resolve — never a wrong colour. That inline `background` is DATA, not design:
 * «Червоний» is a value from the catalogue, not a theme token, which is why it
 * is the one place in this feature that carries a literal colour.
 */
export function ColorSwatchFilter({
  idPrefix,
  values,
  selected,
  onToggle,
}: ColorSwatchFilterProps) {
  return (
    <div className="flex max-h-56 flex-wrap gap-1.5 overflow-y-auto overscroll-contain py-0.5">
      {values.map((value) => {
        const swatch = colorSwatch(value);
        const isSelected = selected.includes(value);
        const id = `${idPrefix}-${value}`;

        return (
          <label
            key={value}
            htmlFor={id}
            // `text-sm`, matching `FilterCheckbox`'s label: a colour chip is a
            // filter row in a different shape, not a different typographic rank.
            className={`flex cursor-pointer items-center gap-2 rounded-full border py-1 pl-1 pr-2.5 text-sm transition-colors ${
              isSelected
                ? "border-primary bg-primary/10 font-semibold text-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <input
              id={id}
              type="checkbox"
              className="peer sr-only"
              checked={isSelected}
              onChange={() => onToggle(value)}
            />
            <span
              aria-hidden="true"
              // `background`, not `backgroundColor`: the unknown-colour fallback
              // is a gradient, real colours are plain CSS colours.
              style={{ background: swatch.css }}
              className={`flex size-5 shrink-0 items-center justify-center rounded-full ring-1 ring-inset peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 ${
                swatch.isLight ? "ring-border" : "ring-black/10"
              }`}
            >
              {isSelected && (
                <Check
                  // A light swatch needs a dark tick and vice versa, or the
                  // confirmation of the click is invisible on half the palette.
                  className={`size-3 ${swatch.isLight ? "text-foreground" : "text-white"}`}
                  strokeWidth={3}
                />
              )}
            </span>
            <span className="min-w-0 truncate">{value}</span>
          </label>
        );
      })}
    </div>
  );
}
