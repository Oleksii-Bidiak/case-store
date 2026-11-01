"use client";

import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import { Check, ChevronRight, Search } from "lucide-react";

import { getDeviceFamilyTone, matchDeviceModels } from "@/entities/device";
import {
  SEARCH_RESULT_LIMIT,
  type PickerModel,
} from "@/features/device-picker";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";

import { FOCUS_RING, PRIMARY_PILL } from "./hero-styles";

const t = dict.devicePicker.hero;
const td = dict.devicePicker.dialog;

/**
 * The matcher flags only typo / letter-by-letter hits as `corrected`; a word
 * its dictionary knows («айфон», «про») is not. Like the picker, confirm any
 * Cyrillic query too (mockup: «Розуміємо й «айфон 15 про» — це …»).
 */
const CYRILLIC = /[а-яіїєґёъыэ]/i;

interface HeroModelSearchProps {
  models: readonly PickerModel[];
  /** The model list is still loading — say so instead of «немає». */
  loading: boolean;
  onChoose: (model: PickerModel) => void;
  /** «Знайти» on an empty field, or a query with no hit → the full picker. */
  onOpenPicker: (query: string) => void;
}

/**
 * The hero's model search: a real field with live, typo- and Cyrillic-
 * tolerant suggestions (`matchDeviceModels`, the same matcher as the picker
 * and site search) in an ARIA 1.2 combobox. ↑/↓ move through the hits, Enter
 * or «Знайти» takes the highlighted one (the first by default), Esc closes
 * the list and a second Esc clears the field. Nothing to pick → «Знайти»
 * opens the full picker with the query, which explains the miss.
 */
export function HeroModelSearch({
  models,
  loading,
  onChoose,
  onOpenPicker,
}: HeroModelSearchProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const optionId = (index: number) => `${listId}-option-${index}`;

  const trimmed = query.trim();
  // ≤ 200 models — matching on every keystroke is cheap, no deferral.
  const results = useMemo(
    () =>
      trimmed
        ? matchDeviceModels(trimmed, models, { limit: SEARCH_RESULT_LIMIT })
        : [],
    [trimmed, models],
  );
  const expanded = open && trimmed !== "";
  const hasResults = expanded && results.length > 0;
  const activeIndex = Math.min(active, Math.max(results.length - 1, 0));
  const top = results[0];

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const pick = results[activeIndex];
    if (trimmed && pick) {
      onChoose(pick.model);
      return;
    }
    onOpenPicker(trimmed);
  };

  return (
    <form onSubmit={submit} className="relative w-full max-w-130">
      <div className="flex h-14 w-full items-center gap-3 rounded-full border-chip border-input bg-background pr-1.5 pl-5 transition-colors hover:border-foreground/35 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25">
        <Search
          aria-hidden="true"
          className="size-5 shrink-0 text-muted-foreground"
        />
        {/* The pill's focus-within border + ring is the field's indicator. */}
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-label={t.searchAria}
          aria-autocomplete="list"
          aria-expanded={hasResults}
          aria-controls={listId}
          aria-activedescendant={hasResults ? optionId(activeIndex) : undefined}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              if (!results.length) return;
              event.preventDefault();
              setOpen(true);
              const step = event.key === "ArrowDown" ? 1 : -1;
              setActive((activeIndex + step + results.length) % results.length);
            } else if (event.key === "Escape") {
              if (expanded) {
                event.preventDefault();
                setOpen(false);
              } else if (query) {
                event.preventDefault();
                setQuery("");
              }
            }
          }}
          placeholder={t.searchPlaceholder}
          autoComplete="off"
          enterKeyHint="search"
          spellCheck={false}
          // The native WebKit clear «×» clutters the pill next to «Знайти».
          // 16px text: iOS does not zoom the page on focus.
          className="h-full min-w-0 flex-1 appearance-none truncate bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:appearance-none"
        />
        <button
          type="submit"
          className={cn(
            "h-11 shrink-0 rounded-full px-5 text-sm font-semibold",
            PRIMARY_PILL,
            FOCUS_RING,
          )}
        >
          {t.searchSubmit}
        </button>
      </div>

      {/* Always in the DOM so `aria-controls` resolves; empty = no popup. */}
      <div
        className={cn(
          "absolute inset-x-0 top-full z-30 mt-2 flex-col gap-1 rounded-card border border-border bg-card p-2 shadow-elevated",
          expanded ? "flex" : "hidden",
        )}
      >
        {hasResults && top && (top.corrected || CYRILLIC.test(trimmed)) && (
          <p className="flex items-center gap-1.5 px-2 pt-1 text-sm text-muted-foreground">
            <Check
              aria-hidden="true"
              strokeWidth={2.5}
              className="size-4 shrink-0 text-success"
            />
            <span className="truncate">
              {td.corrected(trimmed, top.model.name)}
            </span>
          </p>
        )}
        <ul
          id={listId}
          role="listbox"
          aria-label={t.suggestionsAria}
          className="flex flex-col gap-1"
        >
          {hasResults &&
            results.map(({ model }, index) => {
              const tone = getDeviceFamilyTone(model.family);
              return (
                <li
                  key={model.id}
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === activeIndex}
                  // Keep focus in the field: a click must not blur it first.
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseMove={() => setActive(index)}
                  onClick={() => onChoose(model)}
                  className={cn(
                    "flex min-h-14 cursor-pointer items-center gap-3 rounded-pad py-2 pr-3 pl-3.5 transition-colors",
                    index === activeIndex ? tone.surface : "hover:bg-muted",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-2.5 shrink-0 rounded-full",
                      tone.strong,
                    )}
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-px">
                    <span className="truncate font-bold text-foreground">
                      {model.name}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {[
                        model.brandName,
                        dict.devicePicker.productCount(model.productCount),
                      ]
                        .filter(Boolean)
                        .join(dict.devicePicker.metaSeparator)}
                    </span>
                  </span>
                  <ChevronRight
                    aria-hidden="true"
                    className="size-4.5 shrink-0 text-muted-foreground"
                  />
                </li>
              );
            })}
        </ul>
        {expanded && !hasResults && (
          <div
            role="status"
            className="flex flex-col items-start gap-1 p-2 text-sm"
          >
            {loading ? (
              <p className="text-muted-foreground">{td.loading}</p>
            ) : (
              <>
                <p className="font-semibold text-foreground">{t.noMatch}</p>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onOpenPicker(trimmed)}
                  className={cn(
                    "min-h-11 rounded-sm font-semibold text-foreground underline underline-offset-3",
                    FOCUS_RING,
                  )}
                >
                  {t.noMatchAction}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </form>
  );
}
