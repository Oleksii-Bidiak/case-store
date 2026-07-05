import { z } from "zod";
import type {
  CreateBlogCategoryDto,
  UpdateBlogCategoryDto,
} from "@/entities/blog";
import { dict } from "@/shared/config";

const e = dict.blogCategoryForm.errors;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Validation schema for the admin blog-category form. `sortOrder` is a string on
 * the INPUT side (text input) transformed to a number on the OUTPUT side.
 */
export const blogCategorySchema = z.object({
  name: z.string().trim().min(1, e.nameRequired).max(120, e.nameMax),

  slug: z
    .string()
    .trim()
    .max(255, e.slugMax)
    .regex(SLUG_PATTERN, e.slugPattern)
    .optional()
    .or(z.literal("")),

  sortOrder: z
    .string()
    .trim()
    .optional()
    .refine((v) => v === undefined || v === "" || /^\d+$/.test(v), e.sortInt)
    .transform((v) => (v === undefined || v === "" ? undefined : Number(v))),
});

export type BlogCategoryFormInput = z.input<typeof blogCategorySchema>;
export type BlogCategoryFormValues = z.output<typeof blogCategorySchema>;

/** Map parsed form values to a create payload (blank slug → backend auto-slug). */
export function blogCategoryFormValuesToCreateDto(
  values: BlogCategoryFormValues,
): CreateBlogCategoryDto {
  const slug = values.slug?.trim();
  return {
    name: values.name,
    slug: slug ? slug : undefined,
    sortOrder: values.sortOrder,
  };
}

/** Update payload mirrors the create mapper. */
export function blogCategoryFormValuesToUpdateDto(
  values: BlogCategoryFormValues,
): UpdateBlogCategoryDto {
  return blogCategoryFormValuesToCreateDto(values);
}
