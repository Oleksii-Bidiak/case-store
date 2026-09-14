"use client";

import { useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { keepPreviousData } from "@tanstack/react-query";
import {
  useReviewControllerList,
  type ReviewEntity,
  type ReviewReplyEntity,
} from "@/entities/review";
import { RatingStars, ReviewRatingStars, Skeleton, Badge } from "@/shared/ui";
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

/** Format an ISO date string as a short uk-UA date. */
function formatReviewDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("uk-UA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

/**
 * The shop's answer to one review (TASK-446).
 *
 * Rendered INSIDE the review's own `<li>` and indented behind a rule, so it
 * reads as a reply rather than as a second review; `role="group"` +
 * `aria-labelledby` tell a screen reader the same thing the indent tells a
 * sighted reader, since nesting alone carries no meaning in a generic `<div>`.
 *
 * Deliberately no avatar and no person's name — the API does not carry one, and
 * that is the point: the storefront shows the shop answering, never which
 * employee typed it.
 */
function ShopReply({
  reply,
  reviewId,
}: {
  reply: ReviewReplyEntity;
  reviewId: string;
}) {
  const labelId = `review-reply-${reviewId}`;

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className="mt-1 ml-4 flex flex-col gap-1.5 border-l-2 border-border bg-muted/30 py-2.5 pr-3 pl-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span id={labelId} className="text-sm font-medium text-foreground">
          {dict.reviews.shopReply}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          {formatReviewDate(reply.createdAt)}
        </span>
      </div>
      <p className="text-sm whitespace-pre-line text-muted-foreground">
        {reply.body}
      </p>
    </div>
  );
}

function ReviewRow({ review }: { review: ReviewEntity }) {
  return (
    <li className="flex flex-col gap-2 border-b border-border py-4 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <ReviewRatingStars rating={review.rating} />
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

      {review.reply && <ShopReply reply={review.reply} reviewId={review.id} />}
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

  const { data, isPending, isFetching, isError } = useReviewControllerList(
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
    // `aria-busy` while a page is in flight (TASK-598). `keepPreviousData`
    // suppresses `isPending` for every page change after the first, so without
    // this the panel is entirely stale and says nothing: the URL already reads
    // `reviewPage=3` while the screen shows page 2, and on a slow link a shopper
    // cannot tell the click from a click that failed. A screen reader was told
    // nothing at all.
    <div className="flex flex-col gap-6" aria-busy={isFetching}>
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
        <ul
          className={`flex flex-col transition-opacity ${
            isFetching ? "opacity-60" : ""
          }`}
        >
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
          // The page from the ADDRESS, not from `meta` (TASK-598): under
          // `keepPreviousData` the payload still describes the previous page, so
          // `meta.page` kept `aria-current="page"` on the number the shopper had
          // just left — the pager disagreeing with the URL, which reads as a
          // click that did not register.
          currentPage={page}
          totalPages={totalPages}
          buildHref={buildPageHref}
        />
      )}

      <SubmitReviewForm productId={productId} />
    </div>
  );
}
