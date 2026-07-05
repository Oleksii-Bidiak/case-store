import { z } from "zod";
import type { CreatePageDto, UpdatePageDto } from "@/entities/page";
import { dict } from "@/shared/config";

const e = dict.pageForm.errors;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Publish lifecycle values — mirror of the API's PublishStatus enum. */
export const PAGE_STATUS = ["DRAFT", "SCHEDULED", "PUBLISHED"] as const;
export type PageStatus = (typeof PAGE_STATUS)[number];

/**
 * Validation schema for the admin page form.
 *
 * As in the category/product forms, the single numeric field (`sortOrder`) is
 * modelled as a string on the zod INPUT side (bound to a text input) and
 * transformed to a number on the OUTPUT side, so `react-hook-form` registration
 * stays string-only while `onSubmit` receives a parsed number.
 *
 * Publish control (TASK-187): `status` drives visibility; when it is
 * `SCHEDULED` a `scheduledAt` datetime is required (bound to a
 * `datetime-local` input; the empty string means "unset").
 *
 * `content` holds Tiptap HTML. An "empty" Tiptap document still serialises to
 * `<p></p>`, so emptiness is validated by stripping tags and whitespace.
 */
export const pageSchema = z
  .object({
    title: z.string().trim().min(1, e.titleRequired).max(255, e.titleMax),

    slug: z
      .string()
      .trim()
      .max(255, e.slugMax)
      .regex(SLUG_PATTERN, e.slugPattern)
      .optional()
      .or(z.literal("")),

    content: z
      .string()
      .refine(
        (html) => html.replace(/<[^>]*>/g, "").trim().length > 0,
        e.contentRequired,
      ),

    excerpt: z
      .string()
      .trim()
      .max(500, e.excerptMax)
      .optional()
      .or(z.literal("")),

    metaTitle: z
      .string()
      .trim()
      .max(255, e.metaTitleMax)
      .optional()
      .or(z.literal("")),

    metaDescription: z
      .string()
      .trim()
      .max(500, e.metaDescriptionMax)
      .optional()
      .or(z.literal("")),

    sortOrder: z
      .string()
      .trim()
      .optional()
      .refine((v) => v === undefined || v === "" || /^\d+$/.test(v), e.sortInt)
      .transform((v) => (v === undefined || v === "" ? undefined : Number(v))),

    status: z.enum(PAGE_STATUS),

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

export type PageFormInput = z.input<typeof pageSchema>;
export type PageFormValues = z.output<typeof pageSchema>;

/**
 * Map parsed form values to a create/update payload, dropping blank optional
 * strings so the backend treats them as "not provided" (blank slug → auto-slug).
 * `scheduledAt` is only sent for a SCHEDULED page and is normalised to an ISO
 * instant; otherwise it is omitted (the backend clears it).
 */
export function pageFormValuesToCreateDto(
  values: PageFormValues,
): CreatePageDto {
  const slug = values.slug?.trim();
  const excerpt = values.excerpt?.trim();
  const metaTitle = values.metaTitle?.trim();
  const metaDescription = values.metaDescription?.trim();

  const scheduledAt =
    values.status === "SCHEDULED" && values.scheduledAt
      ? new Date(values.scheduledAt).toISOString()
      : undefined;

  return {
    title: values.title,
    content: values.content,
    slug: slug ? slug : undefined,
    excerpt: excerpt ? excerpt : undefined,
    metaTitle: metaTitle ? metaTitle : undefined,
    metaDescription: metaDescription ? metaDescription : undefined,
    sortOrder: values.sortOrder,
    status: values.status,
    scheduledAt,
  };
}

/**
 * Update payload mirrors the create mapper — all fields are optional on the DTO.
 */
export function pageFormValuesToUpdateDto(
  values: PageFormValues,
): UpdatePageDto {
  return pageFormValuesToCreateDto(values);
}
