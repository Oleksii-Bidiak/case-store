"use client";

import { useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Star } from "lucide-react";
import { keepPreviousData } from "@tanstack/react-query";
import { useReviewControllerList, type ReviewEntity } from "@/entities/review";
import { RatingStars, Skeleton, Badge } from "@/shared/ui";
import { Pagination } from "@/shared/ui/pagination";
import { dict } from "@/shared/config";
import { SubmitReviewForm } from "@/features/submit-review";

interface ProductReviewsWidgetProps {
  productId: string;
}

/**
 * Reviews per page (owner's decision 6). The API caps `limit` at 50; ten is what
 * the owner asked for and what the pager is sized against.
 */
const REVIEWS_PER_PAGE = 10;

/**
 * The page lives in `?reviewPage`, not in local state and not in a bare `?page`.
 *  - Not local state: a deep page has to stay a shareable, back-button-able
 *    address, the same way `?tab=reviews` already is.
 *  - Not `?page`: the PDP is not a listing, but a shopper can arrive carrying
 *    any query string, and a generic `page` is exactly the key a catalogue link
 *    would leave behind.
 */
const REVIEW_PAGE_PARAM = "reviewPage";

/**
 * Resolve `?reviewPage` to a real page number. Anything that is not a positive
 * integer — a typo, a stale link, `?reviewPage=0`, `?reviewPage=abc` — falls
 * back to the first page rather than asking the API for nonsense.
 */
export function resolveReviewPageParam(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
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
  const replyLabelId = `review-reply-${review.id}`;

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

      {/* The shop's answer (TASK-446). It sits INSIDE the review's own <li> and
          is indented behind a rule, so it reads as a reply rather than as a
          second review; `role="group"` + `aria-labelledby` say the same thing to
          a screen reader, which cannot see the indent. Deliberately no avatar
          and no person's name: the storefront shows the shop answering, never
          which employee typed it. */}
      {review.reply && (
        <div
          role="group"
          aria-labelledby={replyLabelId}
          className="mt-1 ml-4 flex flex-col gap-1.5 border-l-2 border-border bg-muted/30 py-2.5 pr-3 pl-4"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span
              id={replyLabelId}
              className="text-sm font-medium text-foreground"
            >
              {dict.reviews.shopReply}
            </span>
            <span className="ml-auto text-xs text-muted-foreground">
              {formatReviewDate(review.reply.createdAt)}
            </span>
          </div>
          <p className="text-sm whitespace-pre-line text-muted-foreground">
            {review.reply.body}
          </p>
        </div>
      )}
    </li>
  );
}

/**
 * ProductReviewsWidget — the PDP "Reviews" tab content. Shows the aggregate
 * rating strip, the list of approved reviews (with verified-purchase badges and
 * the shop's replies), the pager, and the auth-gated submit form below. Reviews
 * are addressed by product UUID.
 *
 * On the two counts: `aggregate.ratingCount` counts every rating that counts
 * toward the score, while `meta.total` counts only the reviews with readable
 * text — star-only ratings never reach the list. The larger aggregate is
 * therefore correct, not a mismatch, which is why the strip is labelled with the
 * rating count and the pager is sized from `meta` alone; the two numbers are
 * never set against each other on screen.
 *
 * `useSearchParams` needs a Suspense boundary or the route drops out of static
 * rendering at build time. It already has one: `app/products/[slug]/page.tsx`
 * wraps `<ProductDetailView>` in `<Suspense fallback={<ProductDetailSkeleton/>}>`,
 * and the parent `ProductSpecsTabs` reads the same hook under it for `?tab=`.
 * The PDP's rendering mode is unchanged by this widget.
 */
export function ProductReviewsWidget({ productId }: ProductReviewsWidgetProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const page = resolveReviewPageParam(searchParams.get(REVIEW_PAGE_PARAM));

  const { data, isPending, isError } = useReviewControllerList(
    productId,
    { page, limit: REVIEWS_PER_PAGE },
    {
      // Paging keeps the previous page on screen while the next one loads, so
      // the tab does not collapse to a skeleton and bounce the page height —
      // the pager would jump out from under the cursor mid-click.
      query: { placeholderData: keepPreviousData },
    },
  );

  // Clone the whole query string and set one key, so paging composes with
  // `?tab=reviews` instead of replacing it — otherwise the first click on "2"
  // would page the reviews AND close the reviews tab.
  const buildPageHref = useCallback(
    (targetPage: number) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set(REVIEW_PAGE_PARAM, String(targetPage));
      return `${pathname}?${next.toString()}`;
    },
    [searchParams, pathname],
  );

  if (isPending) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <span className="sr-only">{dict.reviews.loading}</span>
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
  const meta = data?.meta;
  const totalPages = meta?.totalPages ?? 1;

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

      {/* One page is not a choice — the control would be a row of buttons that
          go nowhere. The PDP carries no second pagination, so the shared
          primitive's default `<nav>` name is the right one. */}
      {totalPages > 1 && meta && (
        <Pagination
          currentPage={meta.page}
          totalPages={totalPages}
          buildHref={buildPageHref}
        />
      )}

      <SubmitReviewForm productId={productId} />
    </div>
  );
}
