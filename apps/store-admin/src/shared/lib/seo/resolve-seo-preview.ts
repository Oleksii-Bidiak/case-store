/**
 * SERP-preview SEO resolver (plan 130, TASK-268).
 *
 * A MIRRORED, self-contained port of the storefront's precedence/truncation
 * logic from `apps/store-client/src/shared/lib/seo/resolveSeo.ts`. store-admin
 * and store-client are separate Next.js workspaces and FSD/AGENTS.md forbid one
 * app importing another app's source tree; there is no shared cross-app domain
 * package today (`packages/` holds only `eslint-config`). This module therefore
 * duplicates the small, stable pieces the admin SERP preview needs.
 *
 * IMPORTANT — keep in sync with the storefront:
 * `apps/store-client/src/shared/lib/seo/resolveSeo.ts` owns the production copy
 * (`SEO_TITLE_MAX`/`SEO_DESCRIPTION_MAX`, `stripFormatting`, `truncateAtWord`,
 * the `%s` title-template logic). Any change to the storefront's limits or
 * precedence MUST be mirrored here by hand; the parity unit tests in
 * `resolve-seo-preview.test.ts` pin the exact behavior so a drift fails fast.
 */

/** Google renders ~60 chars of a `<title>` and ~155 of a meta description. */
export const SEO_TITLE_MAX = 60;
export const SEO_DESCRIPTION_MAX = 155;

/** Which precedence tier produced a resolved value — drives the hint copy. */
export type SeoPreviewTier = "own" | "default" | "derived" | "empty";

/** Trim a value, collapsing blank/whitespace-only/non-string input to undefined. */
function clean(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Strip HTML tags and the common markdown markers from rich-text content so a
 * derived title/description reads as plain prose. Ported verbatim from the
 * storefront's `stripFormatting`.
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
 * ellipsis when the text is cut. Ported verbatim from the storefront's
 * `truncateAtWord`.
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

/**
 * Pick the effective `%s`-based title template: the admin's `titleTemplate` when
 * it is set and contains exactly one `%s` token, else the zero-config default
 * `%s | ${brand}`. Mirrors the storefront's `resolveTitleTemplate` (`brand` is
 * store-admin's `dict.brand`, the mirror of store-client's `SITE_NAME`).
 *
 * NOTE — the exactly-one-`%s` check is DELIBERATELY stricter than the
 * storefront's `resolveTitleTemplate` (which uses `.includes("%s")`). It is
 * inert and safe: `UpdateSeoSettingsDto.titleTemplate` is guarded by
 * `@Matches(/^[^%]*%s[^%]*$/)`, so a persisted template can only ever be
 * single-token and well-formed — the two implementations agree on every value
 * that can actually reach here. Do NOT loosen this to `.includes()` to "match"
 * the storefront; the strictness documents the DTO invariant, it doesn't fight it.
 */
export function resolveEffectiveTitleTemplate(
  titleTemplate: string | null | undefined,
  brand: string,
): string {
  const template = clean(titleTemplate);
  const tokenCount = template ? (template.match(/%s/g) ?? []).length : 0;
  return template && tokenCount === 1 ? template : `%s | ${brand}`;
}

/** Apply a `%s` title template to a title (replacing the first `%s` token). */
export function applyTitleTemplate(template: string, title: string): string {
  return template.replace("%s", title);
}

export interface SeoPreviewTitleInput {
  /** Tier 1 — the form's own metaTitle field, live-watched. */
  entityTitle?: string | null;
  /** Tier 2 — SeoSettings.defaultMetaTitle. */
  defaultTitle?: string | null;
  /** Tier 3 — the entity's display name/title (product/category name, page title). */
  contentName?: string | null;
  /** Effective `%s`-template (from {@link resolveEffectiveTitleTemplate}). */
  titleTemplate: string;
}

export interface SeoPreviewTitleResult {
  /** Fully resolved, template-applied display title, exactly as `<title>` renders. */
  text: string;
  /** Which tier resolved: drives the hint copy. */
  tier: SeoPreviewTier;
}

/**
 * Resolve the previewed `<title>` through the three-tier precedence chain.
 *
 * - `entityTitle` set → used verbatim, tier `"own"` (no template, matches the
 *   storefront's `titleAbsolute` override).
 * - blank own + `defaultTitle` set → verbatim, tier `"default"`.
 * - both blank + `contentName` set → the content-derived name (stripped +
 *   truncated to {@link SEO_TITLE_MAX}) branded via `titleTemplate`, tier
 *   `"derived"`.
 * - all three blank (or a derived name that collapses to empty) → `""`, tier
 *   `"empty"`.
 */
export function resolveSeoPreviewTitle(
  input: SeoPreviewTitleInput,
): SeoPreviewTitleResult {
  const entityTitle = clean(input.entityTitle);
  if (entityTitle) return { text: entityTitle, tier: "own" };

  const defaultTitle = clean(input.defaultTitle);
  if (defaultTitle) return { text: defaultTitle, tier: "default" };

  const contentName = clean(input.contentName);
  if (contentName) {
    const derived = truncateAtWord(stripFormatting(contentName), SEO_TITLE_MAX);
    if (derived) {
      return {
        text: applyTitleTemplate(input.titleTemplate, derived),
        tier: "derived",
      };
    }
  }

  return { text: "", tier: "empty" };
}

export interface SeoPreviewDescriptionInput {
  /** Tier 1 — the form's own metaDescription field, live-watched. */
  entityDescription?: string | null;
  /** Tier 2 — SeoSettings.defaultMetaDescription. */
  defaultDescription?: string | null;
  /** Tier 3 — long-form content (may contain HTML/markdown) used to derive one. */
  contentDescription?: string | null;
}

export interface SeoPreviewDescriptionResult {
  /** Resolved description text; `""` only when every tier is absent. */
  text: string;
  tier: SeoPreviewTier;
}

/**
 * Resolve the previewed meta description through the same three-tier chain. No
 * template is applied to descriptions (mirrors the storefront — only titles get
 * the `%s` template).
 */
export function resolveSeoPreviewDescription(
  input: SeoPreviewDescriptionInput,
): SeoPreviewDescriptionResult {
  const own = clean(input.entityDescription);
  if (own) return { text: own, tier: "own" };

  const def = clean(input.defaultDescription);
  if (def) return { text: def, tier: "default" };

  const content = clean(input.contentDescription);
  if (content) {
    const derived = truncateAtWord(
      stripFormatting(content),
      SEO_DESCRIPTION_MAX,
    );
    if (derived) return { text: derived, tier: "derived" };
  }

  return { text: "", tier: "empty" };
}
