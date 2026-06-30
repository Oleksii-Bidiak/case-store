import { z } from "zod";
import { dict } from "@/shared/config";

/**
 * Validation schema for the product-review submission form. Mirrors the backend
 * `CreateReviewDto` (rating 1–5, optional comment ≤ 1000 chars). The rating
 * starts at 0 (unselected) and must be raised to ≥ 1 before submit.
 */
export const reviewSchema = z.object({
  rating: z
    .number()
    .int()
    .min(1, dict.reviews.ratingRequired)
    .max(5, dict.reviews.ratingRequired),
  comment: z.string().max(1000).optional(),
});

export type ReviewFormValues = z.infer<typeof reviewSchema>;
