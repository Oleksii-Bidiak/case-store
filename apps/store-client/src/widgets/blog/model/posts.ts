// Blog view-model + mappers for the storefront /blog pages.
//
// The Blog backend (TASK-170) now owns posts, categories, search and pagination;
// the storefront reads them through the tagged `fetch` helpers in
// `shared/api/blog-server.ts`. This module maps the API `BlogPostEntity` onto the
// presentational `BlogPostView` shape the existing `widgets/blog/ui` components
// render (the UI stays as-is; only its data source changed).

import type { BlogPostEntity } from "@/shared/api";

/** Presentational post shape consumed by the blog UI components. */
export interface BlogPostView {
  slug: string;
  categorySlug: string;
  categoryName: string;
  title: string;
  excerpt: string;
  author: string;
  /** Short display date, e.g. "28 черв. 2026". */
  date: string;
  /** ISO publish instant (for JSON-LD / sitemap `datePublished`). */
  publishedAt: string | null;
  /** Reading-time label, e.g. "8 хв" (empty when unknown). */
  read: string;
  /** OKLCH hue driving the card's token-derived placeholder gradient. */
  hue: number;
  featured: boolean;
  coverImageUrl: string | null;
  /** Sanitized HTML body (present on the single-post fetch; empty in lists). */
  content: string;
}

// Ukrainian abbreviated month names (index 0–11), matching the original mockup
// display format ("28 черв. 2026").
const MONTH_ABBR = [
  "січ.",
  "лют.",
  "берез.",
  "квіт.",
  "трав.",
  "черв.",
  "лип.",
  "серп.",
  "вер.",
  "жовт.",
  "лист.",
  "груд.",
] as const;

// Ukrainian genitive month names, for the article head's long form
// ("28 червня 2026").
const MONTH_FULL = [
  "січня",
  "лютого",
  "березня",
  "квітня",
  "травня",
  "червня",
  "липня",
  "серпня",
  "вересня",
  "жовтня",
  "листопада",
  "грудня",
] as const;

/** Format an ISO instant as a short UA date ("28 черв. 2026"). */
export function formatBlogDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()} ${MONTH_ABBR[d.getMonth()]} ${d.getFullYear()}`;
}

/** Format an ISO instant as a long UA date ("28 червня 2026"). */
export function formatBlogLongDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()} ${MONTH_FULL[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Deterministic hue (0–359) derived from the slug, so a post keeps the same
 * token-driven placeholder gradient across renders even though the backend does
 * not store one.
 */
export function hueForSlug(slug: string): number {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = (hash * 31 + slug.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}

/** Map an API blog-post entity onto the presentational view-model. */
export function toBlogPostView(entity: BlogPostEntity): BlogPostView {
  return {
    slug: entity.slug,
    categorySlug: entity.category.slug,
    categoryName: entity.category.name,
    title: entity.title,
    excerpt: entity.excerpt,
    author: entity.authorName,
    date: formatBlogDate(entity.publishedAt ?? null),
    publishedAt: entity.publishedAt ?? null,
    read: entity.readingMinutes ? `${entity.readingMinutes} хв` : "",
    hue: hueForSlug(entity.slug),
    featured: entity.featured,
    coverImageUrl: entity.coverImageUrl ?? null,
    content: entity.content ?? "",
  };
}

/** Token-driven placeholder cover gradient for a post (mirrors the mockup). */
export function blogGradient(hue: number): string {
  return `linear-gradient(135deg, oklch(0.74 0.12 ${hue}), oklch(0.5 0.17 ${hue}))`;
}

/** First letter of the author name, uppercased, for the avatar chip. */
export function authorInitial(author: string): string {
  return (author.trim()[0] || "?").toUpperCase();
}

/** A single entry in the article table of contents. */
export interface ArticleTocSection {
  id: string;
  label: string;
}

/**
 * Derive an `id` slug from a heading's text content, so the article body's
 * `<h2>`s and the sticky TOC entries share stable anchors even though the stored
 * HTML carries no ids (they are stripped by the server sanitizer's allow-list).
 */
function headingId(text: string, index: number): string {
  const slug = text
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? `${slug}-${index}` : `section-${index}`;
}

/**
 * Parse the sanitized article HTML: inject a stable `id` on every `<h2>` and
 * return the transformed HTML alongside the ordered TOC sections. Pure — safe to
 * run in a server component.
 */
export function buildArticleToc(html: string): {
  html: string;
  sections: ArticleTocSection[];
} {
  const sections: ArticleTocSection[] = [];
  let index = 0;

  const transformed = html.replace(
    /<h2\b([^>]*)>([\s\S]*?)<\/h2>/gi,
    (_match, attrs: string, inner: string) => {
      const label = inner.replace(/<[^>]*>/g, "").trim();
      const id = headingId(label, index);
      sections.push({ id, label });
      index += 1;
      // Drop any pre-existing id attribute, then add our derived one.
      const cleanedAttrs = attrs.replace(/\s+id=("[^"]*"|'[^']*')/gi, "");
      return `<h2${cleanedAttrs} id="${id}">${inner}</h2>`;
    },
  );

  return { html: transformed, sections };
}
