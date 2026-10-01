"use client";

import { useState } from "react";
import { useCategoryControllerGetFilterableSpecs } from "@/entities/category";
import type { ProductControllerFindAllParams } from "@/entities/product";
import { dict } from "@/shared/config";
import { COLOR_SPEC_KEY } from "@/shared/lib";
import { toFacetQueryParams } from "../model/facet-query";
import {
  canSelectSpecValue,
  formatFacetValue,
  parseSpecParam,
  selectedSpecValues,
  toggleSpecValue,
} from "../model/spec-facet";
import { ColorSwatchFilter } from "./color-swatch-filter";
import { FilterCheckbox } from "./filter-checkbox";

/*
 * No facet ceiling here (TASK-707). The «стеля 6 фасетів у сайдбарі» of owner
 * decision B-10 is enforced by the API — `getFilterableSpecs` returns at most
 * `MAX_SPEC_FACETS` facets, in template order, and never drops one the shopper
 * has active. This component used to cut the list again with its own copy of
 * the number, which could only ever disagree with the server: a second cut
 * would drop exactly the active facet the API kept past the template ceiling.
 * The admin panel warns when a category declares more than the ceiling.
 */

/** Facets shown before the "Ще фільтри" disclosure (B-10: «решта під «Ще фільтри»»). */
const INITIAL_FACETS = 3;

const cardClass =
  "rounded-2xl border border-border bg-card p-[18px] shadow-card";
const cardTitleClass =
  "font-display text-[15px] font-bold tracking-tight text-card-foreground";

interface SpecFacetsProps {
  /** Active category id (from the URL). Facets are category-scoped. */
  categoryId?: string;
  /**
   * Every OTHER active catalogue filter (TASK-489). The `specs` param is read
   * from here too, so this replaces the old standalone `specs` prop: the counts
   * beside each value are computed against this whole set, and passing only half
   * of it would publish numbers the grid then contradicts.
   */
  currentParams: ProductControllerFindAllParams;
  onFilterChange: (updates: Record<string, string | undefined>) => void;
  idPrefix?: string;
  /**
   * Override the outer card wrapper class (matches `BrandFilter`). The collapsible
   * mobile drawer (TASK-084) passes `""` so this control renders bare inside a
   * `<details>` card that already provides the chrome.
   */
  cardClassName?: string;
  /** Override the card title class — pass `"sr-only"` to hide the duplicate heading. */
  titleClassName?: string;
}

/**
 * SpecFacets — structured-spec facet controls for the catalog (TASK-191,
 * multi-select since TASK-414 / owner decision B-10).
 *
 * Rendered only when a category is active and it declares filterable specs;
 * offers the facets of `GET /categories/:id/filterable-specs` (at most six —
 * the API's ceiling), the first {@link INITIAL_FACETS}
 * expanded and the rest behind a "Ще фільтри" disclosure.
 *
 * Two defects this replaces, both from the single-`<Select>` version:
 *   - only TWO facets were ever offered, whatever the category declared;
 *   - selecting in one facet OVERWROTE the whole `specs` param, so a second
 *     choice silently discarded the first — the control could express exactly
 *     one key:value pair and nothing else.
 *
 * Now each value is its own checkbox: ticking accumulates within a facet (OR)
 * and across facets (AND), via `toggleSpecValue`, which rewrites only the
 * facet being clicked.
 *
 * Since TASK-489 every value also carries «(12)» — the products behind it with
 * the REST of the selection applied — and a value nothing in the current slice
 * carries is not offered at all. Both halves come straight from the API: the
 * endpoint is told the active filters (see `toFacetQueryParams`) and answers
 * with counted values only, so there is no zero to filter out here and no
 * second, client-side notion of "what is in stock".
 */
export function SpecFacets({
  categoryId,
  currentParams,
  onFilterChange,
  idPrefix = "filter",
  cardClassName = cardClass,
  titleClassName = `${cardTitleClass} mb-4`,
}: SpecFacetsProps) {
  const specs = currentParams.specs;
  const query = useCategoryControllerGetFilterableSpecs(
    categoryId ?? "",
    toFacetQueryParams(currentParams),
    { query: { enabled: Boolean(categoryId) } },
  );
  const [showAll, setShowAll] = useState(false);

  // A facet with no values is dropped rather than rendered empty. The API drops
  // them too since TASK-487 — definitions are declared on a ROOT category and
  // inherited by every descendant, so «Колір» reaches a subcategory whose
  // products have no colour at all. Belt and braces: a control a shopper can
  // open and find nothing in reads as a broken page, not as "no such filter".
  const facets = (query.data?.data ?? []).filter(
    (facet) => facet.values.length > 0,
  );
  const selected = parseSpecParam(specs);
  // TASK-540: a value past the API's `?specs=` caps cannot be ticked — the
  // server would drop it (or, past 600 characters, answer 400), and a tick the
  // grid ignores is exactly the disagreement this rule exists to prevent.
  const canSelect = (key: string, value: string) =>
    canSelectSpecValue(specs, key, value);
  const limitNoteId = `${idPrefix}-spec-limit`;

  if (!categoryId || facets.length === 0) {
    return null;
  }

  const visible = showAll ? facets : facets.slice(0, INITIAL_FACETS);
  const hiddenCount = facets.length - visible.length;
  // One note for the whole card, shown only while some value is blocked. Over
  // every facet, not only the expanded ones: the note has to be there when the
  // shopper opens «Ще фільтри» and finds a row they cannot tick.
  const limitReached = facets.some((facet) =>
    facet.values.some(({ value }) => !canSelect(facet.definition.key, value)),
  );

  return (
    <div className={cardClassName}>
      <h3 className={titleClassName}>{dict.filters.specsTitle}</h3>
      <div className="flex flex-col gap-4">
        {visible.map((facet) => {
          const key = facet.definition.key;
          const active = selectedSpecValues(selected, key);
          const groupId = `${idPrefix}-spec-${key}`;
          return (
            // A real <fieldset>/<legend>: a screen reader then announces which
            // facet each checkbox belongs to, which a bare heading would not do.
            <fieldset key={key} className="min-w-0 border-0 p-0">
              <legend className="mb-1.5 text-[13px] text-muted-foreground">
                {facet.definition.label}
              </legend>
              {key === COLOR_SPEC_KEY ? (
                // Colour is scanned, not read (TASK-487 / B-10): swatch chips
                // instead of a column of checkbox rows. Same `<input>`
                // semantics underneath, and the colour NAME stays visible —
                // colour is never the only channel. See `ColorSwatchFilter`.
                <ColorSwatchFilter
                  idPrefix={groupId}
                  values={facet.values}
                  selected={active}
                  onToggle={(value) =>
                    onFilterChange({
                      specs: toggleSpecValue(specs, key, value),
                    })
                  }
                  canSelect={(value) => canSelect(key, value)}
                  describedBy={limitNoteId}
                />
              ) : (
                <div className="flex max-h-56 flex-col overflow-y-auto overscroll-contain">
                  {facet.values.map(({ value, count }) => (
                    <FilterCheckbox
                      key={value}
                      id={`${groupId}-${value}`}
                      // Not the raw value: a BOOLEAN facet stores "true" and a
                      // SELECT with a unit stores a bare numeral (TASK-488).
                      // The count composes WITH that formatting rather than
                      // replacing it — «Так (4)», «2 шт (11)».
                      label={formatFacetValue(value, facet.definition)}
                      count={count}
                      checked={active.includes(value)}
                      disabled={!canSelect(key, value)}
                      describedBy={limitNoteId}
                      onCheckedChange={() =>
                        onFilterChange({
                          specs: toggleSpecValue(specs, key, value),
                        })
                      }
                    />
                  ))}
                </div>
              )}
            </fieldset>
          );
        })}
      </div>

      {limitReached && (
        <p id={limitNoteId} className="mt-3 text-xs text-muted-foreground">
          {dict.filters.specLimitReached}
        </p>
      )}

      {facets.length > INITIAL_FACETS && (
        <button
          type="button"
          onClick={() => setShowAll((previous) => !previous)}
          aria-expanded={showAll}
          className="mt-3 text-sm font-semibold text-muted-foreground underline decoration-1 underline-offset-2 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          {showAll
            ? dict.filters.fewerFacets
            : dict.filters.moreFacets(hiddenCount)}
        </button>
      )}
    </div>
  );
}
