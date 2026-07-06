import type { SeoSettingsEntity } from "@/shared/api/generated/models";

/**
 * Shared SEO precedence helper (plan 116, Decision 2). Every storefront
 * `generateMetadata()` call site composes the same three tiers through this one
 * pure function instead of ad-hoc `??` chains duplicated per route:
 *
 * ```
 * 1. entity meta   — Product/Category/Page.metaTitle | metaDescription (admin override)
 * 2. SeoSettings   — defaultMetaTitle / defaultMetaDescription / defaultOgImage
 * 3. content       — name + description, HTML/markdown-stripped and truncated
 * ```
 *
 * The title template (`%s | Brand`) is applied separately by the root layout via
 * Next's `title.template`; this helper only reports whether the resolved title is
 * an explicit admin override (`titleAbsolute` → caller uses `title: { absolute }`
 * to bypass the template) or a derived fallback (plain string → the template
 * appends the brand). See `resolveTitleTemplate` / `applyTitleTemplate`.
 */

/** Google renders ~60 chars of a `<title>` and ~155 of a meta description. */
export const SEO_TITLE_MAX = 60;
export const SEO_DESCRIPTION_MAX = 155;

/** The subset of the SeoSettings singleton this helper reads (tier 2). */
export type ResolveSeoSettings = Pick<
  SeoSettingsEntity,
  "defaultMetaTitle" | "defaultMetaDescription" | "defaultOgImage"
>;

export interface ResolveSeoInput {
  /** Tier 1 — the entity's own admin title override (Product/Category/Page.metaTitle). */
  entityTitle?: string | null;
  /** Tier 1 — the entity's own admin description override (…metaDescription). */
  entityDescription?: string | null;
  /** Tier 2 — the global SeoSettings singleton; null when unseeded or the API is down. */
  settings?: ResolveSeoSettings | null;
  /** Tier 3 — content already on the entity, used to derive a readable fallback. */
  content?: {
    /** Display name / title of the entity (product/category name, page title). */
    name?: string | null;
    /** Long-form body (may contain HTML/markdown) used to derive a description. */
    description?: string | null;
  };
}

export interface ResolvedSeo {
  /**
   * The resolved title text. Empty string only when every tier is absent — the
   * caller should OR it with a hard-coded fallback (`resolved.title || dict…`).
   */
  title: string;
  /**
   * True when `title` is an explicit admin override (tiers 1–2) and must be used
   * verbatim (`title: { absolute }`). False for a derived fallback (tier 3),
   * where the caller returns a plain string so the root `title.template` appends
   * the brand.
   */
  titleAbsolute: boolean;
  /** The resolved meta description, or undefined when no usable text exists. */
  description?: string;
  /** The default Open Graph image from settings, or undefined. */
  ogImage?: string;
}

/** Trim a value, collapsing blank/whitespace-only/non-string input to undefined. */
function clean(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Strip HTML tags and the common markdown markers from rich-text content so a
 * derived title/description reads as plain prose. Not a full sanitizer — SEO
 * text only — just enough to keep tags and `*_#`` `>[]()` noise out of `<head>`.
 */
export function stripFormatting(text: string): string {
  return text
    .replace(/<[^>]*>/g, " ") // HTML tags
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // markdown images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // markdown links → link text
    .replace(/[*_`~#>|]/g, " ") // emphasis / heading / quote / code / table markers
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Truncate `text` to at most `max` characters at a word boundary, appending an
 * ellipsis when the text is cut. Trailing punctuation left dangling by the cut
 * is trimmed. Text already within the limit is returned untouched (trimmed).
 */
export function truncateAtWord(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;

  const slice = trimmed.slice(0, max);
  // When the character just past the cut is whitespace, the slice already ends on
  // a word boundary — keep the whole slice instead of dropping its last word.
  const endsOnBoundary = /\s/.test(trimmed.charAt(max));
  const lastSpace = slice.lastIndexOf(" ");
  const cut =
    endsOnBoundary || lastSpace <= 0 ? slice : slice.slice(0, lastSpace);
  return `${cut.replace(/[\s.,;:!?—–-]+$/u, "")}…`;
}

/** Derive a title from raw content: strip formatting and truncate to ~60 chars. */
function deriveTitle(name: string | null | undefined): string | undefined {
  const cleaned = clean(name);
  if (!cleaned) return undefined;
  return truncateAtWord(stripFormatting(cleaned), SEO_TITLE_MAX) || undefined;
}

/** Derive a description from raw content: strip formatting and truncate to ~155 chars. */
function deriveDescription(
  description: string | null | undefined,
): string | undefined {
  const cleaned = clean(description);
  if (!cleaned) return undefined;
  return (
    truncateAtWord(stripFormatting(cleaned), SEO_DESCRIPTION_MAX) || undefined
  );
}

/**
 * Resolve a page's title + description + OG image through the three-tier
 * precedence chain. Pure function — unit-tested.
 */
export function resolveSeo(input: ResolveSeoInput): ResolvedSeo {
  const entityTitle = clean(input.entityTitle);
  const defaultTitle = clean(input.settings?.defaultMetaTitle);

  let title: string;
  let titleAbsolute: boolean;
  if (entityTitle) {
    // Tier 1 — the admin typed an exact title; use it verbatim, no brand suffix.
    title = entityTitle;
    titleAbsolute = true;
  } else if (defaultTitle) {
    // Tier 2 — the global default title; likewise used verbatim.
    title = defaultTitle;
    titleAbsolute = true;
  } else {
    // Tier 3 — derived from content; a plain string so the root template brands it.
    title = deriveTitle(input.content?.name) ?? "";
    titleAbsolute = false;
  }

  const description =
    clean(input.entityDescription) ??
    clean(input.settings?.defaultMetaDescription) ??
    deriveDescription(input.content?.description);

  const ogImage = clean(input.settings?.defaultOgImage);

  return { title, titleAbsolute, description, ogImage };
}

/**
 * Pick the effective `%s`-based title template: the admin's
 * `SeoSettings.titleTemplate` when it is set and contains exactly one `%s`
 * token, else the zero-config default `%s | ${siteName}`. Used by the root
 * layout's `title.template` (which Next applies to a child segment's *static*
 * `metadata` string title) and by `toMetadataTitle` for the `generateMetadata`
 * call sites.
 */
export function resolveTitleTemplate(
  settings: Pick<SeoSettingsEntity, "titleTemplate"> | null | undefined,
  siteName: string,
): string {
  const template = clean(settings?.titleTemplate);
  return template && template.includes("%s") ? template : `%s | ${siteName}`;
}

/** Apply a `%s` title template to a title (replacing the first `%s` token). */
export function applyTitleTemplate(template: string, title: string): string {
  return template.replace("%s", title);
}

/**
 * Turn a {@link ResolvedSeo} into a Next `Metadata.title` value for a
 * `generateMetadata()` call site, always as an `{ absolute }` string.
 *
 * Next 16 applies the root `title.template` to a child's *static* `metadata`
 * string title but NOT to one returned from a page's `generateMetadata`, so the
 * template is applied here explicitly: a derived (tier-3) title is branded with
 * the effective template; an explicit admin override (tiers 1–2) is used
 * verbatim. Either way the rendered `<title>` includes the brand (plan 116 gap 3).
 */
export function toMetadataTitle(
  resolved: ResolvedSeo,
  options: {
    settings?: Pick<SeoSettingsEntity, "titleTemplate"> | null;
    siteName: string;
    /** Hard fallback used when the resolved title is empty. */
    fallback: string;
  },
): { absolute: string } {
  const text = resolved.title || options.fallback;
  if (resolved.titleAbsolute) {
    return { absolute: text };
  }
  return {
    absolute: applyTitleTemplate(
      resolveTitleTemplate(options.settings, options.siteName),
      text,
    ),
  };
}
