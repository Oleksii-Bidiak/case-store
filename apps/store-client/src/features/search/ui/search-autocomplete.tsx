"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Combobox, type ComboboxOption } from "@/shared/ui";
import { useSearchSuggest } from "@/entities/search";
import { useDebouncedCallback } from "@/shared/lib/use-debounced-callback";
import { dict } from "@/shared/config";

/** Minimum characters before we ask the API for suggestions. */
const MIN_QUERY_LENGTH = 1;

interface SearchAutocompleteProps {
  /** Called after a navigation (submit or pick) — e.g. to close the mobile menu. */
  onNavigate?: () => void;
  /** Distinct id so desktop + mobile instances get unique listbox ids. */
  id?: string;
  className?: string;
}

/**
 * SearchAutocomplete — header search box with live, typo-tolerant suggestions.
 *
 * Built on the shared {@link Combobox} primitive (WAI-ARIA listbox, keyboard
 * up/down/enter/esc). Suggestions are fetched via the Orval `useSearchSuggest`
 * hook, debounced per forms.md Rule 3 with a DIRECT `useDebouncedCallback`
 * import. Picking a suggestion goes to its PDP; pressing Enter without a
 * selection submits to `/search?q=` (the `<form>` submit — the Combobox only
 * intercepts Enter when an option is highlighted).
 */
export function SearchAutocomplete({
  onNavigate,
  id = "site-search",
  className,
}: SearchAutocompleteProps) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [query, setQuery] = useState("");

  const debouncedSetQuery = useDebouncedCallback(
    (next: string) => setQuery(next),
    250,
  );

  const { data, isFetching } = useSearchSuggest(
    { q: query },
    { query: { enabled: query.trim().length >= MIN_QUERY_LENGTH } },
  );

  const options: ComboboxOption[] = (data?.data ?? []).map((suggestion) => ({
    value: suggestion.slug,
    label: suggestion.name,
  }));

  const submitSearch = (raw: string) => {
    const q = raw.trim();
    if (q.length === 0) return;
    router.push(`/search?q=${encodeURIComponent(q)}`);
    onNavigate?.();
  };

  return (
    <form
      role="search"
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        submitSearch(value);
      }}
    >
      <label htmlFor={id} className="sr-only">
        {dict.search.inputAria}
      </label>
      <div className="relative">
        <button
          type="submit"
          aria-label={dict.search.submitAria}
          className="absolute left-0 top-0 z-10 flex h-9 w-9 items-center justify-center rounded-l-md text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Search aria-hidden="true" className="size-4" />
        </button>
        <Combobox
          id={id}
          value={value}
          options={options}
          isLoading={isFetching}
          placeholder={dict.search.placeholder}
          loadingText={dict.search.loading}
          emptyText={dict.search.empty}
          className="pl-9"
          onInputChange={(text) => {
            setValue(text);
            debouncedSetQuery(text);
          }}
          onSelect={(option) => {
            setValue(option.label);
            router.push(`/products/${option.value}`);
            onNavigate?.();
          }}
        />
      </div>
    </form>
  );
}
