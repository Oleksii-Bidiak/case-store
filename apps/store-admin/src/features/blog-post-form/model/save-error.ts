import type { UseFormSetError } from "react-hook-form";
import { dict } from "@/shared/config";
import { apiErrorCode, apiErrorStatus } from "@/shared/lib";
import {
  applyServerFieldErrors,
  type ServerFieldMap,
} from "@/shared/lib/form-errors";
import type { BlogPostFormInput } from "./blog-post-schema";

/** The API's code for "another post already has this slug" (TASK-1984). */
const BLOG_POST_SLUG_CONFLICT = "BLOG_POST_SLUG_CONFLICT";

/** `CreateBlogPostDto` / `UpdateBlogPostDto` paths → form fields (Rule 6b). */
export const BLOG_POST_FIELD_MAP: ServerFieldMap = {
  title: "title",
  slug: "slug",
  excerpt: "excerpt",
  content: "content",
  categoryId: "categoryId",
  authorName: "authorName",
  coverImageUrl: "coverImageUrl",
  readingMinutes: "readingMinutes",
  metaTitle: "metaTitle",
  metaDescription: "metaDescription",
  keywords: "keywords",
  "keywords.*": "keywords",
  ogImage: "ogImage",
  scheduledAt: "scheduledAt",
};

export type BlogPostFormSetError = UseFormSetError<BlogPostFormInput>;

/**
 * Puts a refused post save under its field (TASK-1984, Rule 6b) and says
 * whether it did — `false` leaves the toast to the caller. The 409
 * `BLOG_POST_SLUG_CONFLICT` is the slug (typed, or derived from the title)
 * held by another post.
 */
export function placeBlogPostSaveError(
  error: unknown,
  setError: BlogPostFormSetError,
): boolean {
  const status = apiErrorStatus(error);
  if (status === 409 && apiErrorCode(error) === BLOG_POST_SLUG_CONFLICT) {
    setError(
      "slug",
      { type: "server", message: dict.blogPostForm.errors.slugTaken },
      { shouldFocus: true },
    );
    return true;
  }
  if (status !== 400) return false;
  const { mapped, unmapped } = applyServerFieldErrors<BlogPostFormInput>(
    error,
    setError,
    BLOG_POST_FIELD_MAP,
  );
  return mapped.length > 0 && unmapped.length === 0;
}
