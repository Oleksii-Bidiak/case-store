import { z } from "zod";
import { dict } from "@/shared/config";

/** Mirrors the backend `REVIEW_COMMENT_MAX_LENGTH`; the textarea caps at it too. */
export const REVIEW_COMMENT_MAX = 1000;

/**
 * Validation schema for the product-review submission form. Mirrors the backend
 * `CreateReviewDto` (rating 1–5, optional comment ≤ 1000 chars). The rating
 * starts at 0 (unselected) and must be raised to ≥ 1 before submit.
 *
 * The comment cap carries a Ukrainian message and the form renders it
 * (TASK-794) — a bare `.max(1000)` used to block the submit silently.
 */
export const reviewSchema = z.object({
  rating: z
    .number()
    .int()
    .min(1, dict.reviews.ratingRequired)
    .max(5, dict.reviews.ratingRequired),
  comment: z
    .string()
    .max(REVIEW_COMMENT_MAX, dict.reviews.commentMax)
    .optional(),
});

export type ReviewFormValues = z.infer<typeof reviewSchema>;
