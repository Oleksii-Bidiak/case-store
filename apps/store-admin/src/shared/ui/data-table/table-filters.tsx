"use client";

/**
 * TableFilters — the ONE filter idiom for every admin table (TASK-423).
 *
 * ── Why one component and not N hand-rolled Selects ─────────────────────────
 * Before this, filtering was a per-screen invention: the user list used two
 * Radix `Select`s with an `__all__` sentinel, the product list two native
 * `<select>`s with an empty-string sentinel, and eleven other tables had no
 * filters at all. Two idioms and eleven gaps is not a CRM.
 *
 * A filter here is DATA (`TableFilterDef`), not markup, so adding one to a table
 * is a line in an array. Every filter behaves the same way: it owns one query
 * param, writing it resets `page` to 1, and it appears as a dismissible chip
 * while active.
 *
 * ── Why the chips ───────────────────────────────────────────────────────────
 * A `Select` shows its own value, so chips look redundant on one filter — they
 * are not on three. An operator who arrives via a shared link, or comes back to
 * a tab from yesterday, needs ONE place that answers "why am I seeing so few
 * rows?" and a single click that undoes it. That is what makes «нічого не
 * знайдено» diagnosable instead of alarming.
 *
 * ── `position="popper"` is deliberate ───────────────────────────────────────
 * Radix's default `item-aligned` positioning anchors the selected item over the
 * trigger and re-measures on scroll, which is the "select grows while scrolling"
 * the owner reported. `popper` anchors the panel to the trigger instead, and the
 * explicit `max-h` keeps a long option list scrollable rather than taller than
 * the viewport. {@link SELECT_PANEL_CLASS} carries both, plus the one override
 * the shared `SelectContent` needs in popper mode (its viewport is pinned to the
 * trigger's height there, which would clip the list to a single row).
 */

import * as React from "react";
import { XIcon } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { useUrlParams } from "@/shared/lib/use-url-params";
import { dict } from "@/shared/config";
import { Button } from "../button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../select";

const t = dict.common.table;

/**
 * Radix forbids an empty-string `SelectItem` value (it is how the primitive
 * spells "no selection"), so "no filter" needs a sentinel that is never a real
 * option value. It never reaches the URL — {@link TableFilters} deletes the
 * param instead.
 */
export const FILTER_ALL_VALUE = "__all__";

/** Classes every filter/page-size panel in the admin shares. See the header. */
export const SELECT_PANEL_CLASS =
  "max-h-72 [&_[data-radix-select-viewport]]:h-auto";

export interface TableFilterOption {
  /** URL value. Must not be the empty string or {@link FILTER_ALL_VALUE}. */
  value: string;
  label: string;
}

export interface TableFilterDef {
  /** The query param this control owns. */
  param: string;
  /** Accessible name of the control, and the chip's prefix. */
  label: string;
  /** Label of the "no filter" option (e.g. «Усі статуси»). */
  allLabel: string;
  options: TableFilterOption[];
  /**
   * Chip text for a value that is NOT among `options`.
   *
   * Exists for the order queue, where the lifecycle tabs can set a multi-status
   * preset (`CONFIRMED,PROCESSING`) that the Select has no single option for. The
   * rows ARE narrowed by it, so the chip must exist and must be readable —
   * without this it would read «Статус: CONFIRMED,PROCESSING».
   */
  resolveLabel?: (value: string) => string;
  /** Width utility for the trigger. */
  className?: string;
}

export interface TableFiltersProps {
  filters: TableFilterDef[];
  /**
   * Current values keyed by param. Reading stays with the caller (it already
   * holds `useSearchParams()` for its query), so this component owns writing
   * only — the same split `useUrlParams` makes.
   */
  values: Record<string, string | undefined>;
  disabled?: boolean;
  className?: string;
}

/** The chip rows: one per active filter, plus a clear-all once two are on. */
interface ActiveFilter {
  param: string;
  label: string;
  valueLabel: string;
}

export function TableFilters({
  filters,
  values,
  disabled = false,
  className,
}: TableFiltersProps) {
  const updateParams = useUrlParams();

  const active: ActiveFilter[] = [];
  for (const filter of filters) {
    const current = values[filter.param];
    if (!current) continue;
    const option = filter.options.find((o) => o.value === current);
    // An unknown value (a tab preset, a hand-edited link, a renamed option) is
    // still shown — resolved through `resolveLabel` when the caller can name it,
    // raw otherwise: the rows ARE narrowed by it, so the chip that clears it must
    // exist either way.
    active.push({
      param: filter.param,
      label: filter.label,
      valueLabel: option?.label ?? filter.resolveLabel?.(current) ?? current,
    });
  }

  const clear = (param: string) =>
    updateParams({ [param]: undefined, page: undefined });

  const clearAll = () => {
    const patch: Record<string, undefined> = { page: undefined };
    for (const filter of filters) patch[filter.param] = undefined;
    updateParams(patch);
  };

  return (
    <div
      data-slot="table-filters"
      className={cn("flex flex-wrap items-center gap-2", className)}
    >
      {filters.map((filter) => (
        <Select
          key={filter.param}
          value={values[filter.param] || FILTER_ALL_VALUE}
          disabled={disabled}
          onValueChange={(next) =>
            updateParams({
              [filter.param]: next === FILTER_ALL_VALUE ? undefined : next,
              page: undefined,
            })
          }
        >
          <SelectTrigger
            size="sm"
            className={cn("w-40", filter.className)}
            aria-label={filter.label}
          >
            <SelectValue placeholder={filter.allLabel} />
          </SelectTrigger>
          <SelectContent position="popper" className={SELECT_PANEL_CLASS}>
            <SelectItem value={FILTER_ALL_VALUE}>{filter.allLabel}</SelectItem>
            {filter.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}

      {active.map((chip) => (
        <Button
          key={chip.param}
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled}
          onClick={() => clear(chip.param)}
          aria-label={t.clearFilterAria(chip.label, chip.valueLabel)}
        >
          <span>
            {chip.label}: {chip.valueLabel}
          </span>
          <XIcon aria-hidden="true" className="size-3.5" />
        </Button>
      ))}

      {active.length > 1 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={clearAll}
        >
          {t.clearAllFilters}
        </Button>
      )}
    </div>
  );
}
