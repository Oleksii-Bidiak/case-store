"use client";

import { useCategoryControllerGetFilterableSpecs } from "@/entities/category";
import { dict } from "@/shared/config";
import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui";
import { parseSpecParam, toSpecParam } from "../model/spec-facet";

/** Radix Select forbids an empty item value; this stands in for "any value". */
const ANY = "__any__";

/** Max facet controls surfaced in the "basic" cut. */
const MAX_FACETS = 2;

const cardClass =
  "rounded-2xl border border-border bg-card p-[18px] shadow-card";
const cardTitleClass =
  "font-display text-[15px] font-bold tracking-tight text-card-foreground";

interface SpecFacetsProps {
  /** Active category id (from the URL). Facets are category-scoped. */
  categoryId?: string;
  /** Current `specs=key:value` URL param, if any. */
  specs?: string;
  onFilterChange: (updates: Record<string, string | undefined>) => void;
  idPrefix?: string;
}

/**
 * SpecFacets — basic structured-spec facet controls for the catalog (TASK-191).
 * Rendered only when a category is active and it declares filterable specs;
 * offers up to {@link MAX_FACETS} select controls populated from
 * `GET /categories/:id/filterable-specs`. Selecting a value writes a single
 * `?specs=key:value` pair (the basic cut) — picking a value in one facet
 * replaces any prior selection.
 */
export function SpecFacets({
  categoryId,
  specs,
  onFilterChange,
  idPrefix = "filter",
}: SpecFacetsProps) {
  const query = useCategoryControllerGetFilterableSpecs(categoryId ?? "", {
    query: { enabled: Boolean(categoryId) },
  });

  const facets = (query.data?.data ?? []).slice(0, MAX_FACETS);
  const active = parseSpecParam(specs);

  if (!categoryId || facets.length === 0) {
    return null;
  }

  return (
    <div className={cardClass}>
      <h3 className={`${cardTitleClass} mb-4`}>{dict.filters.specsTitle}</h3>
      <div className="flex flex-col gap-3.5">
        {facets.map((facet) => {
          const key = facet.definition.key;
          const selected = active?.key === key ? active.value : ANY;
          const fieldId = `${idPrefix}-spec-${key}`;
          return (
            <div key={key} className="flex flex-col gap-1.5">
              <Label
                htmlFor={fieldId}
                className="text-[13px] text-muted-foreground"
              >
                {facet.definition.label}
              </Label>
              <Select
                value={selected}
                onValueChange={(value) =>
                  onFilterChange({
                    specs: value === ANY ? undefined : toSpecParam(key, value),
                  })
                }
              >
                <SelectTrigger id={fieldId} className="h-[42px]">
                  <SelectValue placeholder={dict.filters.specAnyOption} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>
                    {dict.filters.specAnyOption}
                  </SelectItem>
                  {facet.values.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>
    </div>
  );
}
