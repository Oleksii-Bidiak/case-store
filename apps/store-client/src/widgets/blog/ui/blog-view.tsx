"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { dict } from "@/shared/config";
import { Pagination } from "@/shared/ui/pagination";
import { useDebouncedCallback } from "@/shared/lib/use-debounced-callback";
import type { BlogPostView } from "../model/posts";
import { BlogArrowDownIcon, BlogSearchIcon } from "./blog-icons";
import { BlogEmptyState } from "./blog-empty-state";
import { BlogFeaturedCard } from "./blog-featured-card";
import { BlogNewsletter } from "./blog-newsletter";
import { BlogPostCard } from "./blog-post-card";

/** A category chip descriptor (the synthetic "all" bucket is added first). */
export interface BlogCategoryChip {
  slug: string;
  name: string;
}

interface BlogViewProps {
  /** Posts to render in the grid (already server-filtered + paginated). */
  posts: BlogPostView[];
  /** Category chips (excluding the synthetic "all"). */
  categories: BlogCategoryChip[];
  /** The featured hero post (unfiltered first page only); null otherwise. */
  featured: BlogPostView | null;
  /** Active category slug, or "all". */
  activeCategory: string;
  /** Active free-text query (from the URL). */
  query: string;
  /** 1-based page currently on screen (from `?page=`). */
  page: number;
  /** How many pages the current filter selection has. */
  totalPages: number;
}

/**
 * Build a `/blog` href for a category + query + page selection. Page 1 is
 * spelled without a `?page=` so the hub keeps one canonical URL, and changing
 * the category or the query drops the page entirely — a page 4 of the old
 * selection means nothing in the new one.
 */
function blogHref(category: string, query: string, page = 1): string {
  const params = new URLSearchParams();
  if (category && category !== "all") params.set("category", category);
  if (query.trim()) params.set("q", query.trim());
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/blog?${qs}` : "/blog";
}

/**
 * BlogView — the interactive blog listing (hero + search, category chips,
 * featured hero card, responsive grid, empty state, load-more, newsletter).
 *
 * Filtering, searching and pagination are resolved SERVER-side via the
 * `?category=`/`?q=`/`?page=` URL contract (TASK-173): the search box debounces a
 * `router.push`, category chips are plain links, and every page is its own
 * address. This component only renders the server-provided slice.
 *
 * Paging is the storefront's shared numbered control since TASK-417. Before it,
 * the hub grew one ever-longer list behind a "load more" link — three listings
 * in the app, three different paginations, and a reader who wanted the oldest
 * article had to click their way down to it. The link survives as a shortcut to
 * the next page, which is what it now says.
 */
export function BlogView({
  posts,
  categories,
  featured,
  activeCategory,
  query,
  page,
  totalPages,
}: BlogViewProps) {
  const router = useRouter();

  // Search text mirrors the URL `query`. Seeded once, then re-synced only when
  // the URL changes to a value we did not just push (forms.md async-seed guard).
  const [text, setText] = useState(query);
  const lastPushed = useRef(query);

  useEffect(() => {
    if (query !== lastPushed.current) {
      lastPushed.current = query;
      setText(query);
    }
  }, [query]);

  const pushQuery = useDebouncedCallback((value: string) => {
    lastPushed.current = value;
    router.push(blogHref(activeCategory, value));
  }, 350);

  function onQuery(e: ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setText(value);
    pushQuery(value);
  }

  const chips: BlogCategoryChip[] = [
    { slug: "all", name: dict.blog.categories.all },
    ...categories,
  ];

  const hasPosts = posts.length > 0;
  const isEmpty = !featured && !hasPosts;
  const hasMore = page < totalPages;

  return (
    <>
      {/* Hero: badge + title + subtitle (left), search field (right) */}
      <div className="mb-[26px] flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-[640px]">
          <span
            className="inline-flex items-center gap-[7px] rounded-full px-3 py-[5px] text-[12.5px] font-bold tracking-[0.04em] text-primary"
            style={{
              background:
                "color-mix(in oklab, var(--color-primary) 12%, var(--color-card))",
            }}
          >
            {dict.blog.badge}
          </span>
          <h1 className="mt-3.5 mb-2.5 font-display text-[38px] font-bold leading-[1.08] tracking-[-0.025em] text-foreground">
            {dict.blog.heading}
          </h1>
          <p className="text-base leading-[1.55] text-muted-foreground">
            {dict.blog.subtitle}
          </p>
        </div>
        <div className="w-80 max-w-full">
          <div className="flex h-12 items-center overflow-hidden rounded-xl border-[1.5px] border-border bg-card transition-colors focus-within:border-primary">
            <span className="flex w-12 items-center justify-center text-muted-foreground">
              <BlogSearchIcon width={19} height={19} />
            </span>
            <input
              type="text"
              value={text}
              onChange={onQuery}
              placeholder={dict.blog.searchPlaceholder}
              aria-label={dict.blog.searchAria}
              className="h-full flex-1 border-none bg-transparent pr-2 text-[14.5px] text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>
      </div>

      {/* Category chips */}
      <div
        role="group"
        aria-label={dict.blog.categoryFilterAria}
        className="mb-7 flex flex-wrap items-center gap-2.5"
      >
        {chips.map((chip) => {
          const active = chip.slug === activeCategory;
          return (
            <Link
              key={chip.slug}
              href={blogHref(chip.slug, text)}
              aria-current={active ? "true" : undefined}
              className={`inline-flex h-[38px] cursor-pointer items-center gap-2 rounded-full border-[1.5px] px-4 text-[13.5px] font-semibold no-underline transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:border-primary"
              }`}
            >
              {chip.name}
            </Link>
          );
        })}
      </div>

      {/* Featured hero card (unfiltered view only) */}
      {featured && <BlogFeaturedCard post={featured} />}

      {/* Grid */}
      {hasPosts && (
        <div className="grid gap-[22px] [grid-template-columns:repeat(auto-fill,minmax(304px,1fr))]">
          {posts.map((post) => (
            <BlogPostCard key={post.slug} post={post} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {isEmpty && <BlogEmptyState />}

      {/* Next page shortcut — the reading order most people want, one click */}
      {hasMore && (
        <div className="mt-9 flex justify-center">
          <Link
            href={blogHref(activeCategory, query, page + 1)}
            rel="next"
            className="inline-flex h-12 cursor-pointer items-center gap-2.5 rounded-xl border-[1.5px] border-border bg-card px-[26px] text-[14.5px] font-semibold text-foreground no-underline transition-colors hover:border-primary hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {dict.blog.nextPageLink}
            <BlogArrowDownIcon width={17} height={17} />
          </Link>
        </div>
      )}

      {/* Numbered pages — every slice of the archive is one click away */}
      {totalPages > 1 && (
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          buildHref={(target) => blogHref(activeCategory, query, target)}
          ariaLabel={dict.blog.paginationAria}
          className="mt-7"
        />
      )}

      {/* Newsletter / social channels */}
      <BlogNewsletter />
    </>
  );
}
