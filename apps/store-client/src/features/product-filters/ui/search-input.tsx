"use client";

import { useEffect, useRef, useState } from "react";
import { useDebouncedCallback } from "@/shared/lib/use-debounced-callback";
import { dict } from "@/shared/config";
import { Input, Label } from "@/shared/ui";

interface SearchInputProps {
  /** Current search value from the URL (empty string when absent). */
  initialValue?: string;
  /** Called with the debounced, trimmed value (undefined when empty). */
  onSearch: (value: string | undefined) => void;
}

/** Trim and map an empty string to `undefined` (the URL-absent shape). */
function normalise(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Debounced keyword search input. The visible value updates immediately on every
 * keystroke; the `onSearch` callback fires 300 ms after typing stops.
 *
 * The component stays mounted while the URL evolves (the parent no longer remounts
 * it via a `key`), so DOM focus is retained across the type → debounce →
 * `router.replace` round-trip. A `lastPushedRef` guard lets external `initialValue`
 * changes (e.g. "Clear filters", browser back/forward) re-seed the field without
 * clobbering what the user is mid-typing — our own URL echo is ignored.
 */
export function SearchInput({ initialValue = "", onSearch }: SearchInputProps) {
  const [value, setValue] = useState(initialValue);

  // The last value this component pushed to the URL. Compared against incoming
  // `initialValue` to tell our own echo apart from a genuine external change.
  const lastPushedRef = useRef<string | undefined>(normalise(initialValue));

  const debouncedSearch = useDebouncedCallback((next: string | undefined) => {
    lastPushedRef.current = next;
    onSearch(next);
  }, 300);

  // Re-seed local state only when `initialValue` changes from outside (not from
  // our own debounced push, which would otherwise overwrite mid-typing input).
  useEffect(() => {
    const next = normalise(initialValue);
    if (next !== lastPushedRef.current) {
      setValue(initialValue);
      lastPushedRef.current = next;
    }
  }, [initialValue]);

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="filter-search">{dict.filters.searchLabel}</Label>
      <Input
        id="filter-search"
        type="search"
        value={value}
        onChange={(event) => {
          const raw = event.target.value;
          setValue(raw);
          const next = normalise(raw);
          // Only push when the value actually differs from what we last sent —
          // prevents a redundant navigation when the value is effectively unchanged.
          if (next !== lastPushedRef.current) {
            debouncedSearch(next);
          }
        }}
        placeholder={dict.filters.searchPlaceholder}
        aria-label={dict.filters.searchAria}
      />
    </div>
  );
}
