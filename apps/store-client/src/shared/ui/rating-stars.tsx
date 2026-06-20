import { Star } from "lucide-react";
import { dict } from "@/shared/config";

interface RatingStarsProps {
  /** Average rating 0–5, or null when there are no reviews. */
  average: number | null;
  /** Number of approved reviews. */
  count: number;
  size?: "sm" | "md";
}

/**
 * RatingStars — five stars with a precise fractional fill (an amber overlay
 * clipped to `average / 5`), plus the numeric average and review count.
 * Renders nothing when the product has no approved reviews. Stars are packed
 * with no gap so the clip width maps linearly to the rating.
 *
 * Presentational only — lives in shared/ui and is reused by the product card
 * and the product detail page.
 */
export function RatingStars({ average, count, size = "sm" }: RatingStarsProps) {
  if (!count || average == null) return null;

  const fillPercent = Math.max(0, Math.min(100, (average / 5) * 100));
  const stars = [0, 1, 2, 3, 4];
  const starSize = size === "md" ? "size-4" : "size-3.5";
  const textSize = size === "md" ? "text-sm" : "text-xs";

  return (
    <div
      className="flex items-center gap-1.5"
      aria-label={dict.product.ratingAria(average, count)}
    >
      <span className="relative inline-flex" aria-hidden="true">
        <span className="flex text-muted-foreground/25">
          {stars.map((i) => (
            <Star
              key={i}
              className={starSize}
              fill="currentColor"
              stroke="none"
            />
          ))}
        </span>
        <span
          className="absolute inset-0 flex overflow-hidden text-amber-400"
          style={{ width: `${fillPercent}%` }}
        >
          {stars.map((i) => (
            <Star
              key={i}
              className={`${starSize} shrink-0`}
              fill="currentColor"
              stroke="none"
            />
          ))}
        </span>
      </span>
      <span className={`${textSize} font-medium text-muted-foreground`}>
        {average.toFixed(1)}{" "}
        <span className="text-muted-foreground/70">({count})</span>
      </span>
    </div>
  );
}
