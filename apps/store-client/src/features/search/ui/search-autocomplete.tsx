"use client";

import { useRef } from "react";
import { Search } from "lucide-react";
import { Input } from "@/shared/ui";
import { dict } from "@/shared/config";
import { useSearchAutocomplete } from "../model/use-search-autocomplete";
import { SearchSuggestionsPopup } from "./search-suggestions-popup";

interface SearchAutocompleteProps {
  /** Called after a navigation (submit, pick, show-all) — e.g. to close the mobile menu. */
  onNavigate?: () => void;
  /** Distinct id so every instance gets unique input/listbox/option ids. */
  id?: string;
  /** Focus the input on mount — for panels that open on demand (TASK-411). */
  autoFocus?: boolean;
  className?: string;
}

/**
 * SearchAutocomplete — a stand-alone search field with live, typo-tolerant
 * suggestions: the compact md–lg header panel and the mobile menu (TASK-805).
 *
 * The behaviour is {@link useSearchAutocomplete}'s and the popup is
 * {@link SearchSuggestionsPopup} — exactly what the desktop header pill runs —
 * so products AND blog articles, the «Показати всі результати» exit row and
 * the no-flash loading shield appear at every width. Only the chrome differs:
 * a plain field with the submit icon inside, and a popup anchored under it.
 *
 * The popup closes when focus leaves the form. Options and the exit row
 * swallow `mousedown`, so clicking them never blurs the input first.
 */
export function SearchAutocomplete({
  onNavigate,
  id = "site-search",
  autoFocus = false,
  className,
}: SearchAutocompleteProps) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const search = useSearchAutocomplete({ id, onNavigate });

  return (
    <form
      ref={formRef}
      role="search"
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        search.submit();
      }}
      onBlur={(event) => {
        // Focus moving to something inside the form (the submit icon, the
        // exit row) is not leaving the search.
        if (formRef.current?.contains(event.relatedTarget)) return;
        search.close();
      }}
    >
      <label htmlFor={id} className="sr-only">
        {dict.search.inputAria}
      </label>
      <div className="relative">
        <button
          type="submit"
          aria-label={dict.search.submitAria}
          className="absolute top-0 left-0 z-10 flex h-9 w-9 items-center justify-center rounded-l-md text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Search aria-hidden="true" className="size-4" />
        </button>
        <Input
          {...search.inputProps}
          autoFocus={autoFocus}
          placeholder={dict.search.placeholder}
          className="pl-9"
        />
        {search.showSuggestions && (
          <SearchSuggestionsPopup
            model={search.popup}
            className="absolute top-full right-0 left-0 z-50 mt-1"
          />
        )}
      </div>
    </form>
  );
}
