"use client";

import { useEffect, useState } from "react";

interface SearchInputProps {
  /**
   * Initial search value from the URL. The parent remounts this component
   * (via a `key`) when the URL value changes externally, so local state is
   * re-seeded without a sync effect.
   */
  initialValue?: string;
  /** Called with the debounced, trimmed value (undefined when empty). */
  onSearch: (value: string | undefined) => void;
}

/**
 * Debounced keyword search input. The visible value updates immediately on
 * every keystroke; the `onSearch` callback fires 300 ms after typing stops.
 */
export function SearchInput({ initialValue = "", onSearch }: SearchInputProps) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    const handle = setTimeout(() => {
      const trimmed = value.trim();
      const next = trimmed === "" ? undefined : trimmed;
      const current =
        initialValue.trim() === "" ? undefined : initialValue.trim();
      // Only push to the URL when the value actually differs — prevents a
      // redundant navigation loop after the URL updates.
      if (next !== current) {
        onSearch(next);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [value, initialValue, onSearch]);

  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor="filter-search"
        className="text-sm font-medium text-foreground"
      >
        Search
      </label>
      <input
        id="filter-search"
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search products…"
        aria-label="Search products"
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </div>
  );
}
