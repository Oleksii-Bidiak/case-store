"use client";

import { useCallback, useId, useState } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { keepPreviousData } from "@tanstack/react-query";
import { useSearchSuggest } from "@/entities/search";
import { useBlogControllerFindAll } from "@/entities/blog";
import { useDebouncedCallback } from "@/shared/lib/use-debounced-callback";

/** Minimum characters before we ask the API for suggestions. */
export const SEARCH_MIN_QUERY_LENGTH = 1;
/** Maximum blog articles mixed into the suggestions popup (TASK-218). */
export const BLOG_SUGGEST_LIMIT = 5;
/** Keystroke → request delay (forms.md Rule 3). */
const SUGGEST_DEBOUNCE_MS = 250;

/** One product row of the popup. */
export interface ProductSuggestionItem {
  slug: string;
  name: string;
}

/** One blog-article row of the popup (TASK-218). */
export interface BlogSuggestionItem {
  slug: string;
  title: string;
  coverImageUrl: string | null;
}

/**
 * One entry of the combined keyboard-navigation list: products first, then
 * blog posts, addressed by a single `activeIndex` across both listboxes.
 */
type CombinedSuggestion =
  { kind: "product"; slug: string } | { kind: "blog"; slug: string };

/** Everything {@link SearchSuggestionsPopup} needs to render one popup. */
export interface SearchSuggestionsPopupModel {
  listboxId: string;
  blogListboxId: string;
  optionId: (index: number) => string;
  products: ProductSuggestionItem[];
  blogPosts: BlogSuggestionItem[];
  /** Keyboard selection in the combined list, -1 for none. */
  activeIndex: number;
  /** A request is in flight OR the debounce has not sent it yet. */
  isSearching: boolean;
  /** The trimmed text in the input — what "show all results" searches for. */
  query: string;
  searchHref: string;
  onPickProduct: (slug: string) => void;
  onPickBlogPost: (slug: string) => void;
  /** The "show all results" exit row was clicked (its `href` navigates). */
  onShowAll: () => void;
}

/** The props the owner spreads onto its `<input>`. */
export interface SearchAutocompleteInputProps {
  id?: string;
  role: "combobox";
  "aria-expanded": boolean;
  "aria-controls": string;
  "aria-activedescendant": string | undefined;
  "aria-autocomplete": "list";
  autoComplete: "off";
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onFocus: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}

interface UseSearchAutocompleteOptions {
  /**
   * The input's id; listbox and option ids derive from it. Omitted, an
   * SSR-stable `useId` is used — never a random value, since
   * `aria-activedescendant` must resolve to the same option id on the server
   * and the client.
   */
  id?: string;
  /** Called after any navigation (pick, submit, show-all) — e.g. to close a menu. */
  onNavigate?: () => void;
}

/**
 * useSearchAutocomplete — THE storefront search autocomplete (TASK-805). The
 * header pill, the compact md–lg panel and the mobile menu all run on this one
 * hook, so they cannot drift apart again: before, the pill had blog
 * suggestions, the «Показати всі» exit row and the no-flash shield (TASK-411),
 * and the other two had none of them (TASK-507/509).
 *
 * What it owns:
 *  - the typed `value` and the debounced `query` the requests use;
 *  - product suggestions + up to {@link BLOG_SUGGEST_LIMIT} blog articles, both
 *    with `keepPreviousData`, so the popup never empties between letters;
 *  - `isSearching`, which counts the debounce window as loading — otherwise
 *    the first letter of every search flashes «Нічого не знайдено»;
 *  - the APG combobox keyboard contract over ONE combined list
 *    (products, then articles) with `aria-activedescendant`;
 *  - navigation: an option → its page, Enter with nothing highlighted →
 *    `/search?q=`.
 *
 * What it leaves to the owner: the input's chrome (the pill's segments or a
 * plain field), where the popup is anchored, and how "click outside" is
 * detected — those genuinely differ between the pill and a panel.
 */
export function useSearchAutocomplete({
  id,
  onNavigate,
}: UseSearchAutocompleteOptions = {}) {
  const router = useRouter();

  const generatedId = useId();
  const baseId = id ?? generatedId;
  const listboxId = `${baseId}-listbox`;
  const blogListboxId = `${baseId}-blog-listbox`;
  const optionId = (index: number) => `${baseId}-option-${index}`;

  const [value, setValue] = useState("");
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  /**
   * KEYBOARD selection only. Hovering an option never writes here — otherwise a
   * cursor resting over the popup silently re-targets Enter (TASK-411).
   */
  const [activeIndex, setActiveIndex] = useState(-1);

  const debouncedSetQuery = useDebouncedCallback(
    (next: string) => setQuery(next),
    SUGGEST_DEBOUNCE_MS,
  );

  const enabled = query.trim().length >= SEARCH_MIN_QUERY_LENGTH;

  // `keepPreviousData` on BOTH calls: without it every keystroke empties the
  // popup while the next request is in flight, so it blinks through "Пошук…"
  // between letters and jumps in height (TASK-411).
  const { data: suggestData, isFetching: productsFetching } = useSearchSuggest(
    { q: query },
    { query: { enabled, placeholderData: keepPreviousData } },
  );
  const products: ProductSuggestionItem[] = (suggestData?.data ?? []).map(
    (s) => ({ slug: s.slug, name: s.name }),
  );

  // Blog-article suggestions (TASK-218) — the same debounced `query`, no second
  // timer.
  const { data: blogData, isFetching: blogFetching } = useBlogControllerFindAll(
    { q: query, limit: BLOG_SUGGEST_LIMIT },
    { query: { enabled, placeholderData: keepPreviousData } },
  );
  const blogPosts: BlogSuggestionItem[] = (blogData?.data ?? [])
    .slice(0, BLOG_SUGGEST_LIMIT)
    .map((p) => ({
      slug: p.slug,
      title: p.title,
      coverImageUrl: p.coverImageUrl ?? null,
    }));

  // Single logical list for ↑/↓/Enter: products first, then blog posts.
  const combined: CombinedSuggestion[] = [
    ...products.map((p): CombinedSuggestion => ({
      kind: "product",
      slug: p.slug,
    })),
    ...blogPosts.map((p): CombinedSuggestion => ({
      kind: "blog",
      slug: p.slug,
    })),
  ];

  const trimmed = value.trim();
  const showSuggestions = isOpen && trimmed.length >= SEARCH_MIN_QUERY_LENGTH;
  // The 250ms debounce means `query` trails `value`: between the keystroke and
  // the request there is a window where nothing is in flight and nothing has
  // arrived. Counting that window as "loading" is what stops the popup from
  // flashing "Нічого не знайдено" on the first letter of every search
  // (TASK-509). Either request still running counts too — articles arriving a
  // beat after an empty product answer must not be preceded by a verdict.
  const isSearching =
    productsFetching || blogFetching || trimmed !== query.trim();
  const searchHref = `/search?q=${encodeURIComponent(trimmed)}`;

  // Single source of truth for BOTH the visual highlight and the ARIA pointer:
  // the same `activeIndex`. Absent (undefined, not "") when the list is closed
  // or nothing is highlighted — an empty value would point at no element.
  const activeDescendantId =
    showSuggestions && activeIndex >= 0 && combined[activeIndex]
      ? optionId(activeIndex)
      : undefined;

  // Stable identity (only state setters inside), so an owner can call it from
  // its own document listeners without re-subscribing on every render.
  const close = useCallback(() => {
    setIsOpen(false);
    setActiveIndex(-1);
  }, []);

  function navigate(href: string) {
    close();
    router.push(href);
    onNavigate?.();
  }

  /** Go to the results page for what was typed; a blank query does nothing. */
  function submit() {
    if (trimmed.length === 0) return;
    navigate(searchHref);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!showSuggestions) return;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, combined.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter": {
        const item = activeIndex >= 0 ? combined[activeIndex] : undefined;
        event.preventDefault();
        // Nothing highlighted (the popup is merely open, or the cursor is
        // hovering a row) → the query itself goes to the results page.
        if (!item) submit();
        else if (item.kind === "blog") navigate(`/blog/${item.slug}`);
        else navigate(`/products/${item.slug}`);
        break;
      }
      case "Escape":
        close();
        break;
    }
  }

  const inputProps: SearchAutocompleteInputProps = {
    id,
    role: "combobox",
    "aria-expanded": showSuggestions,
    "aria-controls":
      blogPosts.length > 0 ? `${listboxId} ${blogListboxId}` : listboxId,
    "aria-activedescendant": activeDescendantId,
    "aria-autocomplete": "list",
    autoComplete: "off",
    value,
    onChange: (event) => {
      setValue(event.target.value);
      debouncedSetQuery(event.target.value);
      setIsOpen(true);
      setActiveIndex(-1);
    },
    onFocus: () => setIsOpen(true),
    onKeyDown,
  };

  const popup: SearchSuggestionsPopupModel = {
    listboxId,
    blogListboxId,
    optionId,
    products,
    blogPosts,
    activeIndex,
    isSearching,
    query: trimmed,
    searchHref,
    onPickProduct: (slug) => navigate(`/products/${slug}`),
    onPickBlogPost: (slug) => navigate(`/blog/${slug}`),
    onShowAll: () => {
      close();
      onNavigate?.();
    },
  };

  return {
    /** Raw open flag — true from focus/typing until a close path runs. */
    isOpen,
    /** The popup should be rendered (open AND something typed). */
    showSuggestions,
    close,
    submit,
    inputProps,
    popup,
  };
}
