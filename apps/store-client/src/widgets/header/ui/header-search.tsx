"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu, Newspaper, Search } from "lucide-react";
import { useSearchSuggest } from "@/entities/search";
import { useBlogControllerFindAll } from "@/entities/blog";
import { useCategoryControllerGetCategoryTree } from "@/entities/category";
import { useDebouncedCallback } from "@/shared/lib/use-debounced-callback";
import { Skeleton } from "@/shared/ui";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";

/** Minimum characters before we ask the API for suggestions. */
const MIN_QUERY_LENGTH = 1;
/** Maximum blog articles mixed into the suggestions dropdown (TASK-218). */
const BLOG_SUGGEST_LIMIT = 5;

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

  // SSR-stable ids (never random) — the input's `aria-activedescendant` must
  // resolve to a real option id on both server and client render.
  const uid = useId();
  const listboxId = `${uid}-listbox`;
  const blogListboxId = `${uid}-blog-listbox`;
  /** Option id addressed by the SINGLE combined index (products, then blog). */
  const optionId = (index: number) => `${uid}-option-${index}`;

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

  // Category tree (TASK-082) — roots + one nested level for the flyout. The
  // endpoint hardcodes isActive + sortOrder ascending server-side, matching the
  // params the old flat root-categories call passed explicitly.
  const {
    data: catData,
    isPending: catPending,
    isError: catError,
  } = useCategoryControllerGetCategoryTree();
  const categories = catData?.data ?? [];

  // Which root's children the flyout's right pane shows. Defaults to the first
  // root (same "first group" convention as CategoriesView) so the pane is never
  // blank on open.
  const [activeRootId, setActiveRootId] = useState<string | undefined>();
  const activeRoot =
    categories.find((c) => c.id === activeRootId) ?? categories[0];

  // Focus plumbing for the two-pane keyboard traversal (ArrowRight/ArrowLeft)
  // and for returning focus to the trigger when Escape closes the panel.
  const catalogTriggerRef = useRef<HTMLButtonElement | null>(null);
  const rootLinkRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const childLinkRefs = useRef<Record<string, HTMLAnchorElement | null>>({});

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
        // Keyboard users keep their place: Escape on the catalog panel returns
        // focus to the "Каталог" trigger (TASK-082).
        if (catalogOpen) catalogTriggerRef.current?.focus();
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

  // Single source of truth for BOTH the visual highlight and the ARIA pointer:
  // the same `activeIndex`. Absent (undefined, not "") when the list is closed
  // or nothing is highlighted — an empty value would point at no element.
  const activeDescendantId =
    showSuggestions && activeIndex >= 0 && combined[activeIndex]
      ? optionId(activeIndex)
      : undefined;

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
            ref={catalogTriggerRef}
            type="button"
            onClick={() => {
              setCatalogOpen((v) => !v);
              setSearchOpen(false);
              // Fresh open always previews the first root's children.
              setActiveRootId(undefined);
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
              blogPosts.length > 0 ? `${listboxId} ${blogListboxId}` : listboxId
            }
            aria-activedescendant={activeDescendantId}
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

      {/* Catalog panel — root categories + the active root's children in a
          two-pane flyout (TASK-082). Root links keep navigating on click; the
          right pane is a purely additive hover/focus preview. */}
      {catalogOpen && (
        <div
          role="menu"
          aria-label={dict.header.catalogAria}
          className="absolute top-[calc(100%+8px)] left-0 z-50 rounded-2xl border border-border bg-popover p-2 shadow-lift"
        >
          {catPending && (
            <div className="flex w-64 flex-col gap-1 p-1" aria-hidden="true">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full rounded-lg" />
              ))}
            </div>
          )}
          {catError && (
            <p role="alert" className="w-64 px-3 py-2 text-sm text-destructive">
              {dict.catalog.categoriesError}
            </p>
          )}
          {!catPending && !catError && (
            <>
              <div className="flex">
                <ul className="w-64 pr-2">
                  {categories.map((category) => (
                    <li key={category.id}>
                      <Link
                        ref={(el) => {
                          rootLinkRefs.current[category.id] = el;
                        }}
                        href={`/categories/${category.slug}`}
                        role="menuitem"
                        aria-haspopup={
                          category.children.length > 0 ? "true" : undefined
                        }
                        aria-expanded={
                          category.children.length > 0
                            ? category.id === activeRoot?.id
                            : undefined
                        }
                        onMouseEnter={() => setActiveRootId(category.id)}
                        onFocus={() => setActiveRootId(category.id)}
                        onKeyDown={(event) => {
                          if (
                            event.key === "ArrowRight" &&
                            category.children[0]
                          ) {
                            event.preventDefault();
                            childLinkRefs.current[
                              category.children[0].id
                            ]?.focus();
                          }
                        }}
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
                </ul>

                {activeRoot && activeRoot.children.length > 0 && (
                  <div
                    role="group"
                    aria-label={dict.header.catalogSubcategoriesAria}
                    className="w-64 border-l border-border pl-2"
                  >
                    <ul>
                      {activeRoot.children.map((child) => (
                        <li key={child.id}>
                          <Link
                            ref={(el) => {
                              childLinkRefs.current[child.id] = el;
                            }}
                            href={`/categories/${child.slug}`}
                            role="menuitem"
                            onKeyDown={(event) => {
                              if (event.key === "ArrowLeft") {
                                event.preventDefault();
                                rootLinkRefs.current[activeRoot.id]?.focus();
                              }
                            }}
                            onClick={() => setCatalogOpen(false)}
                            className="flex items-center rounded-xl px-3 py-2.5 text-sm font-medium text-popover-foreground transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {child.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="mt-0.5 border-t border-border pt-2">
                <Link
                  href="/categories"
                  role="menuitem"
                  onClick={() => setCatalogOpen(false)}
                  className="flex items-center rounded-xl px-3 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {dict.header.catalogAll}
                </Link>
              </div>
            </>
          )}
        </div>
      )}

      {/* Suggestions dropdown (anchored to the full pill). */}
      {showSuggestions && (
        <div className="absolute top-[calc(100%+8px)] right-0 left-0 z-50 rounded-2xl border border-border bg-popover p-2 shadow-lift">
          <ul
            id={listboxId}
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
                id={optionId(i)}
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
                id={blogListboxId}
                role="listbox"
                aria-label={dict.search.blogSectionLabel}
                className="max-h-72 overflow-y-auto"
              >
                {blogPosts.map((post, i) => {
                  const index = suggestions.length + i;
                  return (
                    <li
                      key={post.slug}
                      id={optionId(index)}
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
