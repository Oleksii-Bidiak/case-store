import type { SeoSettingsEntity } from "@/shared/api/generated/models";

/**
 * Shared SEO precedence helper (plan 116, Decision 2; re-ordered by plan 176,
 * TASK-432). Every storefront `generateMetadata()` call site composes the same
 * three tiers through this one pure function instead of ad-hoc `??` chains
 * duplicated per route:
 *
 * ```
 * 1. entity meta   — Product/Category/Page.metaTitle | metaDescription (admin override)
 * 2. content       — name + description, HTML/markdown-stripped and truncated
 * 3. SeoSettings   — defaultMetaTitle / defaultMetaDescription / defaultOgImage
 * ```
 *
 * TASK-432 swapped tiers 2 and 3. The old order put the ONE global default above
 * every page's own content, so a store that filled in `defaultMetaDescription`
 * shipped that same store-wide sentence as the `<meta name="description">` of
 * every product, category and page that had no hand-written override — which is
 * exactly the "description describes the shop, not the product" defect the owner
 * reported. Page content is always more specific than a site-wide default, so it
 * wins; the global default is now the last resort, for pages with no usable
 * content of their own (a bare listing hub, an empty category).
 *
 * IMPORTANT — `content` means the ENTITY's own content (product name/description,
 * category name, page title/body). It is NOT a place for a call site's hardcoded
 * localized string: a dictionary constant passed as `content` would now outrank
 * the global default the owner typed in /settings/seo. Call sites keep their
 * dictionary strings as the OUTER fallback (`resolved.title || dict…`,
 * `resolved.description ?? dict…`) instead.
 *
 * The title template (`%s | Brand`) is applied separately by the root layout via
 * Next's `title.template`; this helper only reports whether the resolved title is
 * an explicit admin override (`titleAbsolute` → caller uses `title: { absolute }`
 * to bypass the template) or a derived fallback (plain string → the template
 * appends the brand). See `resolveTitleTemplate` / `applyTitleTemplate`. That
 * mapping is bound to the TIER, not to the winner's rank: an entity title and a
 * global default are both verbatim (`titleAbsolute: true`), a content-derived
 * title is branded (`false`) — unchanged by the re-ordering.
 */

/** Google renders ~60 chars of a `<title>` and ~155 of a meta description. */
export const SEO_TITLE_MAX = 60;
export const SEO_DESCRIPTION_MAX = 155;

/** The subset of the SeoSettings singleton this helper reads (tier 3). */
export type ResolveSeoSettings = Pick<
  SeoSettingsEntity,
  "defaultMetaTitle" | "defaultMetaDescription" | "defaultOgImage"
>;

export interface ResolveSeoInput {
  /** Tier 1 — the entity's own admin title override (Product/Category/Page.metaTitle). */
  entityTitle?: string | null;
  /** Tier 1 — the entity's own admin description override (…metaDescription). */
  entityDescription?: string | null;
  /** Tier 3 — the global SeoSettings singleton; null when unseeded or the API is down. */
  settings?: ResolveSeoSettings | null;
  /**
   * Tier 2 — content already ON THE ENTITY, used to derive a readable, page-
   * specific fallback. Never a hardcoded dictionary string (see the file header).
   */
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
   * True when `title` is an explicit admin-typed title — the entity's own
   * `metaTitle` (tier 1) or the global `defaultMetaTitle` (tier 3) — and must be
   * used verbatim (`title: { absolute }`). False for a content-derived title
   * (tier 2), where the caller returns a plain string so the root
   * `title.template` appends the brand.
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
  const derivedTitle = deriveTitle(input.content?.name);
  const defaultTitle = clean(input.settings?.defaultMetaTitle);

  let title: string;
  let titleAbsolute: boolean;
  if (entityTitle) {
    // Tier 1 — the admin typed an exact title; use it verbatim, no brand suffix.
    title = entityTitle;
    titleAbsolute = true;
  } else if (derivedTitle) {
    // Tier 2 — derived from the entity's own content; a plain string so the root
    // template brands it (`Чохли для iPhone | CaseStore`).
    title = derivedTitle;
    titleAbsolute = false;
  } else if (defaultTitle) {
    // Tier 3 — the global default title, for a page with no content of its own;
    // likewise an admin-typed string, so used verbatim.
    title = defaultTitle;
    titleAbsolute = true;
  } else {
    title = "";
    titleAbsolute = false;
  }

  const description =
    clean(input.entityDescription) ??
    deriveDescription(input.content?.description) ??
    clean(input.settings?.defaultMetaDescription);

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
 * template is applied here explicitly: a content-derived title is branded with
 * the effective template; an admin-typed title (the entity's `metaTitle` or the
 * global `defaultMetaTitle`) is used verbatim. Either way the rendered `<title>`
 * includes the brand (plan 116 gap 3).
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
