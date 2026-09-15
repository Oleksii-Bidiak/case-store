"use client";

import { useState } from "react";
import { useCategoryControllerGetFilterableSpecs } from "@/entities/category";
import { dict } from "@/shared/config";
import { COLOR_SPEC_KEY } from "@/shared/lib";
import {
  parseSpecParam,
  selectedSpecValues,
  toggleSpecValue,
} from "../model/spec-facet";
import { ColorSwatchFilter } from "./color-swatch-filter";
import { FilterCheckbox } from "./filter-checkbox";

/**
 * Hard ceiling on the facets offered at once, matching the API's own
 * `MAX_SPEC_FACETS`: each extra facet is another EXISTS subquery server-side,
 * and anything past this is silently dropped there anyway.
 */
const MAX_FACETS = 6;

/** Facets shown before the "Ще фільтри" disclosure. */
const INITIAL_FACETS = 3;

const cardClass =
  "rounded-2xl border border-border bg-card p-[18px] shadow-card";
const cardTitleClass =
  "font-display text-[15px] font-bold tracking-tight text-card-foreground";

interface SpecFacetsProps {
  /** Active category id (from the URL). Facets are category-scoped. */
  categoryId?: string;
  /** Current `specs` URL param, if any (`key:v1,v2;key2:v3`). */
  specs?: string;
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
 * offers up to {@link MAX_FACETS} facets from
 * `GET /categories/:id/filterable-specs`, the first {@link INITIAL_FACETS}
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
 */
export function SpecFacets({
  categoryId,
  specs,
  onFilterChange,
  idPrefix = "filter",
  cardClassName = cardClass,
  titleClassName = `${cardTitleClass} mb-4`,
}: SpecFacetsProps) {
  const query = useCategoryControllerGetFilterableSpecs(categoryId ?? "", {
    query: { enabled: Boolean(categoryId) },
  });
  const [showAll, setShowAll] = useState(false);

  // A facet with no values is dropped rather than rendered empty. The API drops
  // them too since TASK-487 — definitions are declared on a ROOT category and
  // inherited by every descendant, so «Колір» reaches a subcategory whose
  // products have no colour at all. Belt and braces: a control a shopper can
  // open and find nothing in reads as a broken page, not as "no such filter".
  const facets = (query.data?.data ?? [])
    .filter((facet) => facet.values.length > 0)
    .slice(0, MAX_FACETS);
  const selected = parseSpecParam(specs);

  if (!categoryId || facets.length === 0) {
    return null;
  }

  const visible = showAll ? facets : facets.slice(0, INITIAL_FACETS);
  const hiddenCount = facets.length - visible.length;

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
                />
              ) : (
                <div className="flex max-h-56 flex-col overflow-y-auto overscroll-contain">
                  {facet.values.map((value) => (
                    <FilterCheckbox
                      key={value}
                      id={`${groupId}-${value}`}
                      label={value}
                      checked={active.includes(value)}
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

      {facets.length > INITIAL_FACETS && (
        <button
          type="button"
          onClick={() => setShowAll((previous) => !previous)}
          aria-expanded={showAll}
          className="mt-3 text-[13.5px] font-semibold text-muted-foreground underline decoration-1 underline-offset-2 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          {showAll
            ? dict.filters.fewerFacets
            : dict.filters.moreFacets(hiddenCount)}
        </button>
      )}
    </div>
  );
}
