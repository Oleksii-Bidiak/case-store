"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Newspaper, Search } from "lucide-react";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import { FallbackImg } from "@/shared/ui";
import type { SearchSuggestionsPopupModel } from "../model/use-search-autocomplete";
import { useSearchDeviceModel } from "../model/use-search-device-model";
import { SearchModelBlock } from "./search-model-block";

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
    onFollowLink,
  } = model;
  // The device model the query names (TASK-2069) — the same typo-tolerant
  // matcher as the device picker. Nothing recognised → the popup is exactly
  // as before.
  const deviceMatch = useSearchDeviceModel(query);
  // Anything the popup can offer — products OR articles. Counting products
  // alone printed "нічого не знайдено" above a list of matching posts.
  const hasSuggestions = products.length > 0 || blogPosts.length > 0;

  // The popup scrolls as one box, so a keyboard walk past its edge must bring
  // the highlighted row into view — focus stays on the input, so the browser
  // will not do it for us (TASK-1996).
  const activeOptionId = activeIndex >= 0 ? optionId(activeIndex) : undefined;
  useEffect(() => {
    if (!activeOptionId) return;
    document
      .getElementById(activeOptionId)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeOptionId]);

  return (
    <div
      className={cn(
        // ONE scroll area, capped to the viewport (TASK-1996). The popup lives
        // inside the sticky header, so page scroll can never reveal what runs
        // past its bottom edge — on an 844×390 landscape phone two `max-h-72`
        // lists made it ~620px tall. 12rem covers the worst anchor: announcement
        // bar + header row + the compact panel's field above the popup and the
        // panel's padding below it; 36rem keeps it a dropdown on a desktop.
        // eslint-disable-next-line tailwindcss/no-arbitrary-value -- viewport-tied height cap, see above; no max-height token for it yet
        "max-h-[min(36rem,calc(100dvh-12rem))] overflow-y-auto overscroll-contain rounded-2xl border border-border bg-popover p-2 shadow-lift",
        className,
      )}
    >
      {deviceMatch && (
        <>
          <SearchModelBlock match={deviceMatch} onFollowLink={onFollowLink} />
          <hr aria-hidden="true" className="mx-3 my-2 border-t border-border" />
        </>
      )}

      <ul
        id={listboxId}
        role="listbox"
        aria-label={dict.search.inputAria}
        // `min-h-16` is the floor that keeps the popup from resizing under the
        // cursor as a query narrows from several rows down to one.
        className="min-h-16"
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
          least one match; scrolls with the product list as one box. */}
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
                  {/* No cover, or one the CSP blocks / that fails to load —
                      the same newspaper icon (TASK-759). */}
                  <FallbackImg
                    src={post.coverImageUrl}
                    alt=""
                    className="size-8 shrink-0 rounded-md object-cover"
                    fallback={
                      <Newspaper
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    }
                  />
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
