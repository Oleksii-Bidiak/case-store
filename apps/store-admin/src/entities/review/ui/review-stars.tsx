import { Star } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { dict } from "@/shared/config";

/**
 * A review's rating (1–5) as a non-interactive star row, named for a screen
 * reader as «N з 5 зірок». Shared by the moderation queue and the reply
 * dialog's quote (wave 198, ReviewsProposal В1/В8): the same review must not
 * read as two different ratings on one screen.
 */
export function ReviewStars({
  rating,
  className,
}: {
  rating: number;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={dict.reviews.ratingAria(rating)}
      className={cn("inline-flex shrink-0", className)}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          aria-hidden="true"
          fill="currentColor"
          stroke="none"
          className={cn(
            "size-3.5",
            i <= rating ? "text-warning" : "text-muted-foreground/30",
          )}
        />
      ))}
    </span>
  );
}
