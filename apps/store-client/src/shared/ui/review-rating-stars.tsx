import { Star } from "lucide-react";
import { dict } from "@/shared/config";

interface ReviewRatingStarsProps {
  /** A single review's whole-number rating, 1–5. */
  rating: number;
  /** `sm` in a review row; `lg` where the rating is the subject, as in a form. */
  size?: "sm" | "lg";
}

/**
 * ReviewRatingStars — five stars filled to ONE review's whole-number rating,
 * named for assistive tech («4 з 5 зірок») rather than left as five decorative
 * glyphs.
 *
 * Deliberately not {@link RatingStars}, which answers a different question: that
 * one renders an AGGREGATE — a fractional amber clip plus the numeric average
 * and the review count. This one is a single, exact, non-interactive rating.
 *
 * Presentational only (shared/ui): it is read by the reviews list and by the
 * submit form, which shows the author the rating they already left. Both had
 * their own copy of this markup until TASK-446 put the second one a size apart
 * from the first.
 */
export function ReviewRatingStars({
  rating,
  size = "sm",
}: ReviewRatingStarsProps) {
  const starSize = size === "lg" ? "size-6" : "size-3.5";

  return (
    <span
      className="inline-flex w-fit items-center"
      role="img"
      aria-label={dict.reviews.starAria(rating)}
    >
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          className={
            value <= rating
              ? `${starSize} text-amber-400`
              : `${starSize} text-muted-foreground/25`
          }
          fill="currentColor"
          stroke="none"
          aria-hidden="true"
        />
      ))}
    </span>
  );
}
