"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import { dict } from "@/shared/config";
import {
  BLOG_FILTER_KEYS,
  BLOG_POSTS,
  blogCategoryCounts,
  type BlogFilterKey,
} from "../model/posts";
import { BlogArrowDownIcon, BlogSearchIcon } from "./blog-icons";
import { BlogEmptyState } from "./blog-empty-state";
import { BlogFeaturedCard } from "./blog-featured-card";
import { BlogNewsletter } from "./blog-newsletter";
import { BlogPostCard } from "./blog-post-card";

const INITIAL_LIMIT = 9;
const LOAD_STEP = 6;

/**
 * BlogView — the interactive blog listing (hero + search, category chips,
 * featured hero card, responsive grid, empty state, load-more, newsletter).
 *
 * All filtering, searching and pagination run client-side over the static
 * `BLOG_POSTS` seed (no Blog backend yet — TASK-170). The featured hero card
 * only shows in the unfiltered view (no category + no query), matching the
 * mockup. Load-more is gated on there actually being more posts to reveal.
 */
export function BlogView() {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<BlogFilterKey>("all");
  const [limit, setLimit] = useState(INITIAL_LIMIT);

  const counts = useMemo(() => blogCategoryCounts(), []);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      BLOG_POSTS.filter(
        (p) =>
          (cat === "all" || p.cat === cat) &&
          (!q ||
            p.title.toLowerCase().includes(q) ||
            p.excerpt.toLowerCase().includes(q)),
      ),
    [cat, q],
  );

  const useFeatured = cat === "all" && !q;
  const featured = useFeatured
    ? (filtered.find((p) => p.featured) ?? filtered[0] ?? null)
    : null;
  const rest = featured ? filtered.filter((p) => p !== featured) : filtered;
  const shown = rest.slice(0, limit);
  const hasPosts = shown.length > 0;
  const hasMore = shown.length < rest.length;
  const isEmpty = filtered.length === 0;

  function pickCat(key: BlogFilterKey) {
    setCat(key);
    setLimit(INITIAL_LIMIT);
  }

  function onQuery(e: ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    setLimit(INITIAL_LIMIT);
  }

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
              value={query}
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
        {BLOG_FILTER_KEYS.map((key) => {
          const active = key === cat;
          return (
            <button
              key={key}
              type="button"
              onClick={() => pickCat(key)}
              aria-pressed={active}
              className={`inline-flex h-[38px] cursor-pointer items-center gap-2 rounded-full border-[1.5px] px-4 text-[13.5px] font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:border-primary"
              }`}
            >
              {dict.blog.categories[key]}
              <span className="font-mono text-xs opacity-70">
                {counts[key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Featured hero card (unfiltered view only) */}
      {featured && <BlogFeaturedCard post={featured} />}

      {/* Grid */}
      {hasPosts && (
        <div className="grid gap-[22px] [grid-template-columns:repeat(auto-fill,minmax(304px,1fr))]">
          {shown.map((post) => (
            <BlogPostCard key={post.slug} post={post} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {isEmpty && <BlogEmptyState />}

      {/* Load more */}
      {hasPosts && hasMore && (
        <div className="mt-9 flex justify-center">
          <button
            type="button"
            onClick={() => setLimit((l) => l + LOAD_STEP)}
            className="inline-flex h-12 cursor-pointer items-center gap-2.5 rounded-xl border-[1.5px] border-border bg-card px-[26px] text-[14.5px] font-semibold text-foreground transition-colors hover:border-primary hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {dict.blog.loadMore}
            <BlogArrowDownIcon width={17} height={17} />
          </button>
        </div>
      )}

      {/* Newsletter / social channels */}
      <BlogNewsletter />
    </>
  );
}
