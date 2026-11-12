import { z } from "zod";
import type { CreateBlogPostDto, UpdateBlogPostDto } from "@/entities/blog";
import { dict } from "@/shared/config";
import { SLUG_PATTERN } from "@/shared/lib/slug";
import {
  META_DESCRIPTION_MAX_LENGTH,
  META_TITLE_MAX_LENGTH,
  ogImageField,
  seoTextFields,
} from "@/shared/lib/seo-fields-schema";
import { fromKyivDateTimeLocal } from "@/shared/lib";
import { optionalHttpUrl } from "@/shared/lib/http-url";
import { isPastKyivDateTimeLocal } from "@/shared/lib/scheduled-at";
import {
  KEYWORDS_MAX_COUNT,
  KEYWORD_MAX_LENGTH,
  parseKeywords,
} from "@/shared/lib/seo";
import { BLOG_CONTENT_MAX_LENGTH } from "./content-stats";

const e = dict.blogPostForm.errors;
const seoErrors = dict.seoFields.errors;

/**
 * The DTO's `@MaxLength` caps (`apps/store-api/src/blog/dto/create-blog-post.dto.ts`;
 * `ogImage` is `OG_IMAGE_MAX_LENGTH` of `IsOgImageField` in
 * `apps/store-api/src/common/validators/seo-fields.decorator.ts`) — read by the
 * schema and by the inputs' `maxLength` (TASK-1984, Rule 5d).
 */
export const BLOG_POST_LIMITS = {
  title: 255,
  slug: 255,
  excerpt: 500,
  authorName: 120,
  coverImageUrl: 2048,
  metaTitle: META_TITLE_MAX_LENGTH,
  metaDescription: META_DESCRIPTION_MAX_LENGTH,
  ogImage: 2048,
} as const;

/** Publish lifecycle values — mirror of the API's PublishStatus enum. */
export const BLOG_POST_STATUS = ["DRAFT", "SCHEDULED", "PUBLISHED"] as const;
export type BlogPostStatus = (typeof BLOG_POST_STATUS)[number];

/**
 * Validation schema for the admin blog-post form.
 *
 * Numeric `readingMinutes` is modelled as a string on the INPUT side (bound to a
 * text input) and transformed to a number (or undefined) on the OUTPUT side, so
 * RHF registration stays string-only. `content` holds Tiptap HTML — an "empty"
 * document still serialises to `<p></p>`, so emptiness is validated by stripping
 * tags. Publish control (TASK-187): a `SCHEDULED` status requires `scheduledAt`.
 */
export const blogPostSchema = z
  .object({
    // Stricter on purpose (Rule 5f): `CreateBlogPostDto.title` / `excerpt` /
    // `authorName` have no minimum, but each is shown on every article card.
    title: z
      .string()
      .trim()
      .min(1, e.titleRequired)
      .max(BLOG_POST_LIMITS.title, e.titleMax),

    slug: z
      .string()
      .trim()
      .max(BLOG_POST_LIMITS.slug, e.slugMax)
      .regex(SLUG_PATTERN, dict.seoFields.errors.slugPattern)
      .optional()
      .or(z.literal("")),

    excerpt: z
      .string()
      .trim()
      .min(1, e.excerptRequired)
      .max(BLOG_POST_LIMITS.excerpt, e.excerptMax),

    content: z
      .string()
      .refine(
        (html) => html.replace(/<[^>]*>/g, "").trim().length > 0,
        e.contentRequired,
      )
      // TASK-1154 — the API's `@MaxLength` on the HTML; said here, under the
      // counter, instead of as a 400 after the click.
      .refine(
        (html) => html.length <= BLOG_CONTENT_MAX_LENGTH,
        e.contentMax(BLOG_CONTENT_MAX_LENGTH.toLocaleString("uk-UA")),
      ),

    categoryId: z.string().min(1, e.categoryRequired),

    authorName: z
      .string()
      .trim()
      .min(1, e.authorRequired)
      .max(BLOG_POST_LIMITS.authorName, e.authorMax),

    // TASK-1984 (Rule 5): the DTO's `@IsUrl(BLOG_COVER_URL_OPTIONS)` — an
    // absolute http(s) link (zod's `.url()` took `mailto:` and `javascript:`)
    // — and its `@MaxLength(2048)`.
    coverImageUrl: optionalHttpUrl(e.coverUrl).refine(
      (value) =>
        value === undefined || value.length <= BLOG_POST_LIMITS.coverImageUrl,
      e.coverUrlMax(BLOG_POST_LIMITS.coverImageUrl),
    ),

    // `@IsInt() @Min(1)`: «0 хвилин» is refused, with the same words.
    readingMinutes: z
      .string()
      .trim()
      .optional()
      .refine(
        (v) =>
          v === undefined || v === "" || (/^\d+$/.test(v) && Number(v) >= 1),
        e.readingInt,
      )
      .transform((v) => (v === undefined || v === "" ? undefined : Number(v))),

    featured: z.boolean(),
    listed: z.boolean(),

    // SEO overrides (TASK-437). Until now the article had none: the storefront
    // derived its <title> from the heading and its description from the excerpt,
    // with no way to write either.
    ...seoTextFields(),

    // Internal tags as one comma-separated field, validated on the PARSED list.
    keywords: z
      .string()
      .optional()
      .refine(
        (raw) => parseKeywords(raw).length <= KEYWORDS_MAX_COUNT,
        seoErrors.keywordsCount(KEYWORDS_MAX_COUNT),
      )
      .refine(
        (raw) =>
          parseKeywords(raw).every((k) => k.length <= KEYWORD_MAX_LENGTH),
        seoErrors.keywordLength(KEYWORD_MAX_LENGTH),
      ),

    // `ogImageField` checks the URL rule only; the cap is the DTO's
    // `IsOgImageField` → `@MaxLength(OG_IMAGE_MAX_LENGTH)` (Rule 5d).
    ogImage: ogImageField().refine(
      (value) =>
        value === undefined || value.length <= BLOG_POST_LIMITS.ogImage,
      seoErrors.ogImageMax(BLOG_POST_LIMITS.ogImage),
    ),

    status: z.enum(BLOG_POST_STATUS),

    // `datetime-local` value ("YYYY-MM-DDTHH:mm") or empty string when unset.
    scheduledAt: z.string().optional().or(z.literal("")),
  })
  .superRefine((values, ctx) => {
    if (values.status === "SCHEDULED" && !values.scheduledAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scheduledAt"],
        message: e.scheduledAtRequired,
      });
    }

    // TASK-1984 (Rule 5e): the API would publish a past schedule NOW, silently.
    if (
      values.status === "SCHEDULED" &&
      isPastKyivDateTimeLocal(values.scheduledAt)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scheduledAt"],
        message: e.scheduledAtPast,
      });
    }
  });

export type BlogPostFormInput = z.input<typeof blogPostSchema>;
export type BlogPostFormValues = z.output<typeof blogPostSchema>;

/**
 * Map parsed form values to a create payload, dropping blank optional strings so
 * the backend treats them as "not provided" (blank slug → auto-slug).
 * `scheduledAt` is only sent for a SCHEDULED post, normalised to an ISO instant.
 */
export function blogPostFormValuesToCreateDto(
  values: BlogPostFormValues,
): CreateBlogPostDto {
  const slug = values.slug?.trim();
  const coverImageUrl = values.coverImageUrl?.trim();
  const metaTitle = values.metaTitle?.trim();
  const metaDescription = values.metaDescription?.trim();
  const ogImage = values.ogImage?.trim();

  // Read as KYIV wall-clock time. `new Date("YYYY-MM-DDTHH:mm")` — what stood
  // here — parses a zone-less datetime in the RUNTIME's zone, which contradicts
  // the Kyiv-pinned post list the operator read the date off in the first place.
  // See `shared/lib/format/datetime-local.ts`.
  const scheduledAt =
    values.status === "SCHEDULED" && values.scheduledAt
      ? fromKyivDateTimeLocal(values.scheduledAt)?.toISOString()
      : undefined;

  return {
    title: values.title,
    excerpt: values.excerpt,
    content: values.content,
    categoryId: values.categoryId,
    authorName: values.authorName,
    slug: slug ? slug : undefined,
    coverImageUrl: coverImageUrl ? coverImageUrl : undefined,
    readingMinutes: values.readingMinutes,
    featured: values.featured,
    listed: values.listed,
    // TASK-437 — blank means CLEAR, not "leave as is", and the DTO accepts null
    // on create as well as update, so this one mapper still serves both verbs.
    // Sending `undefined` instead would make a wrong meta title unremovable.
    metaTitle: metaTitle ? metaTitle : null,
    metaDescription: metaDescription ? metaDescription : null,
    keywords: parseKeywords(values.keywords),
    ogImage: ogImage ? ogImage : null,
    status: values.status,
    scheduledAt,
  };
}

/** Update payload mirrors the create mapper — all DTO fields are optional. */
export function blogPostFormValuesToUpdateDto(
  values: BlogPostFormValues,
): UpdateBlogPostDto {
  return blogPostFormValuesToCreateDto(values);
}
