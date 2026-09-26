"use client";

import Link from "next/link";
import { Newspaper, Search } from "lucide-react";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import type { SearchSuggestionsPopupModel } from "../model/use-search-autocomplete";

interface SearchSuggestionsPopupProps {
  model: SearchSuggestionsPopupModel;
  /** Positioning classes — the owner decides what the popup anchors to. */
  className?: string;
}

/**
 * SearchSuggestionsPopup — the one suggestions popup of the storefront search
 * (TASK-805): products, then up to five blog articles in a second labelled
 * listbox, then — only when nothing matched — a way out to the full results
 * page. Driven entirely by {@link useSearchAutocomplete}; the header pill and
 * {@link SearchAutocomplete} (compact panel, mobile menu) render the same
 * markup.
 */
export function SearchSuggestionsPopup({
  model,
  className,
}: SearchSuggestionsPopupProps) {
  const {
    listboxId,
    blogListboxId,
    optionId,
    products,
    blogPosts,
    activeIndex,
    isSearching,
    query,
    searchHref,
    onPickProduct,
    onPickBlogPost,
    onShowAll,
  } = model;
  // Anything the popup can offer — products OR articles. Counting products
  // alone printed "нічого не знайдено" above a list of matching posts.
  const hasSuggestions = products.length > 0 || blogPosts.length > 0;

  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-popover p-2 shadow-lift",
        className,
      )}
    >
      <ul
        id={listboxId}
        role="listbox"
        aria-label={dict.search.inputAria}
        // `min-h-16` is the floor that keeps the popup from resizing under the
        // cursor as a query narrows from several rows down to one.
        className="max-h-72 min-h-16 overflow-y-auto"
      >
        {isSearching && !hasSuggestions && (
          <li
            role="presentation"
            className="px-3 py-2 text-sm text-muted-foreground"
          >
            {dict.search.loading}
          </li>
        )}
        {!isSearching && !hasSuggestions && (
          <li
            role="presentation"
            className="px-3 py-2 text-sm text-muted-foreground"
          >
            {dict.search.empty}
          </li>
        )}
        {products.map((suggestion, i) => (
          <li
            key={suggestion.slug}
            id={optionId(i)}
            role="option"
            aria-selected={i === activeIndex}
            // Keep the input from blurring before the click lands.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPickProduct(suggestion.slug)}
            className={cn(
              // Hover tints the row through CSS only — it must not move the
              // keyboard selection that Enter commits.
              "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-popover-foreground hover:bg-muted",
              i === activeIndex && "bg-muted",
            )}
          >
            <Search
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate">{suggestion.name}</span>
          </li>
        ))}
      </ul>

      {/* Blog-article suggestions (TASK-218) — rendered only when there is at
          least one match; scrolls independently of the product list. */}
      {blogPosts.length > 0 && (
        <>
          <hr aria-hidden="true" className="mx-3 my-2 border-t border-border" />
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
              const index = products.length + i;
              return (
                <li
                  key={post.slug}
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onPickBlogPost(post.slug)}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-popover-foreground hover:bg-muted",
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
                  <span className="min-w-0 flex-1 truncate">{post.title}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* A dead end is never acceptable: when nothing matched, the popup still
          offers the full results page for what was typed (TASK-411/507). It
          sits OUTSIDE the listbox on purpose — a focusable link is not a valid
          child of `role="listbox"`, whose children must be options. */}
      {!isSearching && !hasSuggestions && (
        <Link
          href={searchHref}
          // Mirrors the option rows: keep the input from blurring before the
          // click lands.
          onMouseDown={(event) => event.preventDefault()}
          onClick={onShowAll}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Search className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">
            {dict.search.showAllResults(query)}
          </span>
        </Link>
      )}
    </div>
  );
}
