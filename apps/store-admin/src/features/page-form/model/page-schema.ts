import { z } from "zod";
import type { CreatePageDto, UpdatePageDto } from "@/entities/page";
import { dict } from "@/shared/config";

const e = dict.pageForm.errors;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Validation schema for the admin page form.
 *
 * As in the category/product forms, the single numeric field (`sortOrder`) is
 * modelled as a string on the zod INPUT side (bound to a text input) and
 * transformed to a number on the OUTPUT side, so `react-hook-form` registration
 * stays string-only while `onSubmit` receives a parsed number.
 *
 * `content` holds Tiptap HTML. An "empty" Tiptap document still serialises to
 * `<p></p>`, so emptiness is validated by stripping tags and whitespace.
 */
export const pageSchema = z.object({
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

  isActive: z.boolean().optional(),
});

export type PageFormInput = z.input<typeof pageSchema>;
export type PageFormValues = z.output<typeof pageSchema>;

/**
 * Map parsed form values to a create/update payload, dropping blank optional
 * strings so the backend treats them as "not provided" (blank slug → auto-slug).
 */
export function pageFormValuesToCreateDto(
  values: PageFormValues,
): CreatePageDto {
  const slug = values.slug?.trim();
  const excerpt = values.excerpt?.trim();
  const metaTitle = values.metaTitle?.trim();
  const metaDescription = values.metaDescription?.trim();

  return {
    title: values.title,
    content: values.content,
    slug: slug ? slug : undefined,
    excerpt: excerpt ? excerpt : undefined,
    metaTitle: metaTitle ? metaTitle : undefined,
    metaDescription: metaDescription ? metaDescription : undefined,
    sortOrder: values.sortOrder,
    isActive: values.isActive,
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
