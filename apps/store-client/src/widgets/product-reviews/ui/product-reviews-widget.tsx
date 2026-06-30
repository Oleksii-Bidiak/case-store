"use client";

import { Star } from "lucide-react";
import { useReviewControllerList, type ReviewEntity } from "@/entities/review";
import { RatingStars, Skeleton, Badge } from "@/shared/ui";
import { dict } from "@/shared/config";
import { SubmitReviewForm } from "@/features/submit-review";

interface ProductReviewsWidgetProps {
  productId: string;
}

/**
 * A compact, non-interactive star row for a single review's rating (1–5).
 * The aggregate strip uses the richer {@link RatingStars}; this is the simpler
 * per-review display.
 */
function ReviewStars({ rating }: { rating: number }) {
  return (
    <span
      className="inline-flex"
      role="img"
      aria-label={dict.reviews.starAria(rating)}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={
            i <= rating
              ? "size-3.5 text-amber-400"
              : "size-3.5 text-muted-foreground/25"
          }
          fill="currentColor"
          stroke="none"
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

/** Format an ISO date string as a short uk-UA date. */
function formatReviewDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("uk-UA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function ReviewRow({ review }: { review: ReviewEntity }) {
  return (
    <li className="flex flex-col gap-2 border-b border-border py-4 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <ReviewStars rating={review.rating} />
        <span className="text-sm font-medium text-foreground">
          {dict.reviews.anonymous}
        </span>
        {review.verifiedPurchase && (
          <Badge variant="secondary" className="text-xs">
            {dict.reviews.verifiedPurchase}
          </Badge>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {formatReviewDate(review.createdAt)}
        </span>
      </div>
      <p className="text-sm whitespace-pre-line text-muted-foreground">
        {review.comment && review.comment.length > 0
          ? review.comment
          : dict.reviews.noComment}
      </p>
    </li>
  );
}

/**
 * ProductReviewsWidget — the PDP "Reviews" tab content. Shows the aggregate
 * rating strip, the list of approved reviews (with verified-purchase badges),
 * and the auth-gated submit form below. Reviews are addressed by product UUID.
 */
export function ProductReviewsWidget({ productId }: ProductReviewsWidgetProps) {
  const { data, isPending, isError } = useReviewControllerList(productId, {
    page: 1,
    limit: 10,
  });

  if (isPending) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p className="py-4 text-sm text-muted-foreground">
        {dict.reviews.loadError}
      </p>
    );
  }

  const reviews = data?.data ?? [];
  const aggregate = data?.aggregate;
  const count = aggregate?.ratingCount ?? 0;

  return (
    <div className="flex flex-col gap-6">
      {count > 0 && aggregate ? (
        <div className="flex items-center gap-3">
          <RatingStars
            average={aggregate.ratingAverage}
            count={aggregate.ratingCount}
            size="md"
          />
          <span className="text-sm text-muted-foreground">
            {dict.reviews.ratingCount(aggregate.ratingCount)}
          </span>
        </div>
      ) : null}

      {reviews.length > 0 ? (
        <ul className="flex flex-col">
          {reviews.map((review) => (
            <ReviewRow key={review.id} review={review} />
          ))}
        </ul>
      ) : (
        <p className="py-4 text-sm text-muted-foreground">
          {dict.reviews.empty}
        </p>
      )}

      <SubmitReviewForm productId={productId} />
    </div>
  );
}
