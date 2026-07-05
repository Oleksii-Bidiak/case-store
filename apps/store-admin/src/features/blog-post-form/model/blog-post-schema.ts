import { z } from "zod";
import type { CreateBlogPostDto, UpdateBlogPostDto } from "@/entities/blog";
import { dict } from "@/shared/config";

const e = dict.blogPostForm.errors;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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
    title: z.string().trim().min(1, e.titleRequired).max(255, e.titleMax),

    slug: z
      .string()
      .trim()
      .max(255, e.slugMax)
      .regex(SLUG_PATTERN, e.slugPattern)
      .optional()
      .or(z.literal("")),

    excerpt: z.string().trim().min(1, e.excerptRequired).max(500, e.excerptMax),

    content: z
      .string()
      .refine(
        (html) => html.replace(/<[^>]*>/g, "").trim().length > 0,
        e.contentRequired,
      ),

    categoryId: z.string().min(1, e.categoryRequired),

    authorName: z
      .string()
      .trim()
      .min(1, e.authorRequired)
      .max(120, e.authorMax),

    coverImageUrl: z
      .string()
      .trim()
      .url(e.coverUrl)
      .optional()
      .or(z.literal("")),

    readingMinutes: z
      .string()
      .trim()
      .optional()
      .refine(
        (v) => v === undefined || v === "" || /^\d+$/.test(v),
        e.readingInt,
      )
      .transform((v) => (v === undefined || v === "" ? undefined : Number(v))),

    featured: z.boolean(),

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

  const scheduledAt =
    values.status === "SCHEDULED" && values.scheduledAt
      ? new Date(values.scheduledAt).toISOString()
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
