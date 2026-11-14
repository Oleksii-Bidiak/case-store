import type { UseFormSetError } from "react-hook-form";
import { dict } from "@/shared/config";
import { apiErrorCode, apiErrorStatus } from "@/shared/lib";
import {
  applyServerFieldErrors,
  type ServerFieldMap,
} from "@/shared/lib/form-errors";
import type { BlogCategoryFormInput } from "./blog-category-schema";

/** The API's code for "another category already has this slug" (TASK-1984). */
const BLOG_CATEGORY_SLUG_CONFLICT = "BLOG_CATEGORY_SLUG_CONFLICT";

/** `CreateBlogCategoryDto` / `UpdateBlogCategoryDto` paths → form fields (Rule 6b). */
export const BLOG_CATEGORY_FIELD_MAP: ServerFieldMap = {
  name: "name",
  slug: "slug",
};

export type BlogCategoryFormSetError = UseFormSetError<BlogCategoryFormInput>;

/**
 * Puts a refused category save under its field (TASK-1984, Rule 6b) and says
 * whether it did — `false` leaves the toast to the caller. The 409
 * `BLOG_CATEGORY_SLUG_CONFLICT` is the slug (typed, or derived from the name)
 * held by another category.
 */
export function placeBlogCategorySaveError(
  error: unknown,
  setError: BlogCategoryFormSetError,
): boolean {
  const status = apiErrorStatus(error);
  if (status === 409 && apiErrorCode(error) === BLOG_CATEGORY_SLUG_CONFLICT) {
    setError(
      "slug",
      { type: "server", message: dict.blogCategoryForm.errors.slugTaken },
      { shouldFocus: true },
    );
    return true;
  }
  if (status !== 400) return false;
  const { mapped, unmapped } = applyServerFieldErrors<BlogCategoryFormInput>(
    error,
    setError,
    BLOG_CATEGORY_FIELD_MAP,
  );
  return mapped.length > 0 && unmapped.length === 0;
}
