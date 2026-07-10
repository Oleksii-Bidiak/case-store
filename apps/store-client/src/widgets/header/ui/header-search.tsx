"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu, Newspaper, Search } from "lucide-react";
import { useSearchSuggest } from "@/entities/search";
import { useBlogControllerFindAll } from "@/entities/blog";
import { useCategoryControllerGetRootCategories } from "@/entities/category";
import { useDebouncedCallback } from "@/shared/lib/use-debounced-callback";
import { Skeleton } from "@/shared/ui";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";

/** Minimum characters before we ask the API for suggestions. */
const MIN_QUERY_LENGTH = 1;
/** Maximum blog articles mixed into the suggestions dropdown (TASK-218). */
const BLOG_SUGGEST_LIMIT = 5;
const LISTBOX_ID = "header-search-listbox";
const BLOG_LISTBOX_ID = "header-search-blog-listbox";

/**
 * One entry of the combined keyboard-navigation list: products first, then
 * blog posts, addressed by a single `activeIndex` across both listboxes.
 */
type CombinedSuggestion =
  | { kind: "product"; slug: string }
  | { kind: "blog"; slug: string };

/**
 * HeaderSearch — the desktop search pill from the design import: one bordered
 * container holding the "Каталог" mega-menu trigger (left segment), the search
 * input (middle), and a primary submit button (right). The catalog panel is
 * filled with the real root categories; the input shows typo-tolerant
 * suggestions. Both dropdowns anchor to the full pill and are mutually exclusive.
 * The suggestions dropdown mixes products with up to 5 matching blog articles
 * (TASK-218) — two labelled listboxes navigated as one combined list.
 *
 * Reuses the storefront search hooks; keyboard nav (↑/↓/Enter/Esc) mirrors the
 * shared Combobox. Hidden below `md` — mobile navigates via the header Sheet.
 */
export function HeaderSearch() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [value, setValue] = useState("");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const debouncedSetQuery = useDebouncedCallback(
    (next: string) => setQuery(next),
    250,
  );

  const { data: suggestData, isFetching } = useSearchSuggest(
    { q: query },
    { query: { enabled: query.trim().length >= MIN_QUERY_LENGTH } },
  );
  const suggestions = suggestData?.data ?? [];

  // Blog-article suggestions (TASK-218) — reuses the same debounced `query`
  // state as the product suggest call (no second debounce timer).
  const { data: blogData } = useBlogControllerFindAll(
    { q: query, limit: BLOG_SUGGEST_LIMIT },
    { query: { enabled: query.trim().length >= MIN_QUERY_LENGTH } },
  );
  const blogPosts = (blogData?.data ?? []).slice(0, BLOG_SUGGEST_LIMIT);

  // Single logical list for ↑/↓/Enter: products first, then blog posts.
  const combined: CombinedSuggestion[] = [
    ...suggestions.map(
      (s): CombinedSuggestion => ({ kind: "product", slug: s.slug }),
    ),
    ...blogPosts.map(
      (p): CombinedSuggestion => ({ kind: "blog", slug: p.slug }),
    ),
  ];

  const {
    data: catData,
    isPending: catPending,
    isError: catError,
  } = useCategoryControllerGetRootCategories({
    isActive: true,
    sortBy: "sortOrder",
    sortOrder: "asc",
  });
  const categories = catData?.data ?? [];

  // Close both dropdowns on outside-click and Escape.
  useEffect(() => {
    if (!searchOpen && !catalogOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setSearchOpen(false);
        setCatalogOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSearchOpen(false);
        setCatalogOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [searchOpen, catalogOpen]);

  const showSuggestions = searchOpen && value.trim().length >= MIN_QUERY_LENGTH;
  const hasSuggestions = suggestions.length > 0;

  function submitSearch(raw: string) {
    const q = raw.trim();
    if (q.length === 0) return;
    setSearchOpen(false);
    router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  function pick(slug: string) {
    setSearchOpen(false);
    router.push(`/products/${slug}`);
  }

  function pickBlogPost(slug: string) {
    setSearchOpen(false);
    router.push(`/blog/${slug}`);
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
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
        if (item) {
          event.preventDefault();
          if (item.kind === "blog") pickBlogPost(item.slug);
          else pick(item.slug);
        }
        break;
      }
      case "Escape":
        setSearchOpen(false);
        setActiveIndex(-1);
        break;
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative z-40 hidden max-w-2xl flex-1 md:block"
    >
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          submitSearch(value);
        }}
      >
        <div className="flex h-12 items-center overflow-hidden rounded-xl border-[1.5px] border-border bg-background">
          {/* Каталог — mega-menu trigger (left segment). */}
          <button
            type="button"
            onClick={() => {
              setCatalogOpen((v) => !v);
              setSearchOpen(false);
            }}
            aria-expanded={catalogOpen}
            aria-haspopup="menu"
            aria-label={dict.header.catalogAria}
            className="flex h-full shrink-0 items-center gap-1.5 border-r border-border bg-muted px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            <Menu className="size-[18px]" aria-hidden="true" />
            {dict.header.catalogButton}
          </button>

          {/* Search input (middle). */}
          <input
            type="text"
            role="combobox"
            aria-expanded={showSuggestions}
            aria-controls={
              blogPosts.length > 0
                ? `${LISTBOX_ID} ${BLOG_LISTBOX_ID}`
                : LISTBOX_ID
            }
            aria-autocomplete="list"
            aria-label={dict.search.inputAria}
            autoComplete="off"
            value={value}
            placeholder={dict.search.placeholder}
            onChange={(event) => {
              setValue(event.target.value);
              debouncedSetQuery(event.target.value);
              setSearchOpen(true);
              setCatalogOpen(false);
              setActiveIndex(-1);
            }}
            onFocus={() => setSearchOpen(true)}
            onKeyDown={onInputKeyDown}
            className="h-full min-w-0 flex-1 border-0 bg-transparent px-4 text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
          />

          {/* Primary submit (right). */}
          <button
            type="submit"
            aria-label={dict.search.submitAria}
            className="flex h-full w-[54px] shrink-0 items-center justify-center bg-primary text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            <Search className="size-5" aria-hidden="true" />
          </button>
        </div>
      </form>

      {/* Catalog panel (real root categories). */}
      {catalogOpen && (
        <div
          role="menu"
          aria-label={dict.header.catalogAria}
          className="absolute top-[calc(100%+8px)] left-0 z-50 w-72 rounded-2xl border border-border bg-popover p-2 shadow-[var(--shadow-lift)]"
        >
          {catPending && (
            <div className="flex flex-col gap-1 p-1" aria-hidden="true">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full rounded-lg" />
              ))}
            </div>
          )}
          {catError && (
            <p role="alert" className="px-3 py-2 text-sm text-destructive">
              {dict.catalog.categoriesError}
            </p>
          )}
          {!catPending && !catError && (
            <ul>
              {categories.map((category) => (
                <li key={category.id}>
                  <Link
                    href={`/products?categoryId=${category.id}`}
                    role="menuitem"
                    onClick={() => setCatalogOpen(false)}
                    className="flex items-center rounded-xl px-3 py-2.5 text-sm font-medium text-popover-foreground transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {category.name}
                  </Link>
                </li>
              ))}
              {categories.length === 0 && (
                <li className="px-3 py-2 text-sm text-muted-foreground">
                  {dict.catalog.noCategories}
                </li>
              )}
              <li>
                <Link
                  href="/categories"
                  role="menuitem"
                  onClick={() => setCatalogOpen(false)}
                  className="mt-0.5 flex items-center rounded-xl px-3 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {dict.header.catalogAll}
                </Link>
              </li>
            </ul>
          )}
        </div>
      )}

      {/* Suggestions dropdown (anchored to the full pill). */}
      {showSuggestions && (
        <div className="absolute top-[calc(100%+8px)] right-0 left-0 z-50 rounded-2xl border border-border bg-popover p-2 shadow-[var(--shadow-lift)]">
          <ul
            id={LISTBOX_ID}
            role="listbox"
            aria-label={dict.search.inputAria}
            className="max-h-72 overflow-y-auto"
          >
            {isFetching && !hasSuggestions && (
              <li
                role="presentation"
                className="px-3 py-2 text-sm text-muted-foreground"
              >
                {dict.search.loading}
              </li>
            )}
            {!isFetching && !hasSuggestions && (
              <li
                role="presentation"
                className="px-3 py-2 text-sm text-muted-foreground"
              >
                {dict.search.empty}
              </li>
            )}
            {suggestions.map((suggestion, i) => (
              <li
                key={suggestion.slug}
                role="option"
                aria-selected={i === activeIndex}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => pick(suggestion.slug)}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-popover-foreground",
                  i === activeIndex && "bg-muted",
                )}
              >
                <Search
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate">
                  {suggestion.name}
                </span>
              </li>
            ))}
          </ul>

          {/* Blog-article suggestions (TASK-218) — rendered only when there is
              at least one match; scrolls independently of the product list. */}
          {blogPosts.length > 0 && (
            <>
              <hr
                aria-hidden="true"
                className="mx-3 my-2 border-t border-border"
              />
              <p className="px-3 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {dict.search.blogSectionLabel}
              </p>
              <ul
                id={BLOG_LISTBOX_ID}
                role="listbox"
                aria-label={dict.search.blogSectionLabel}
                className="max-h-72 overflow-y-auto"
              >
                {blogPosts.map((post, i) => {
                  const index = suggestions.length + i;
                  return (
                    <li
                      key={post.slug}
                      role="option"
                      aria-selected={index === activeIndex}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => pickBlogPost(post.slug)}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-popover-foreground",
                        index === activeIndex && "bg-muted",
                      )}
                    >
                      {post.coverImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={post.coverImageUrl}
                          alt=""
                          className="size-8 shrink-0 rounded-md object-cover"
                        />
                      ) : (
                        <Newspaper
                          className="size-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                      )}
                      <span className="min-w-0 flex-1 truncate">
                        {post.title}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
