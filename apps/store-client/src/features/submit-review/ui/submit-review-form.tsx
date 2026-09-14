"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Star } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/entities/session";
import {
  useReviewControllerSubmit,
  useReviewControllerMine,
  useReviewControllerUpdate,
  getReviewControllerListQueryKey,
  getReviewControllerMineQueryKey,
  OwnReviewEntityTextStatus,
  type OwnReviewEntity,
} from "@/entities/review";
import { Button, ReviewRatingStars, Textarea } from "@/shared/ui";
import { dict } from "@/shared/config";
import { reviewSchema, type ReviewFormValues } from "../model/review-schema";

interface SubmitReviewFormProps {
  productId: string;
}

/** A blank form. A module constant so RHF's `values` keeps a stable identity. */
const EMPTY_REVIEW: ReviewFormValues = { rating: 0, comment: "" };

/**
 * What to tell the author about their own text, honestly.
 *
 * The order matters. A star-only rating is stored as `comment: null` with
 * `textStatus: PENDING` — PENDING is the column's default, not a verdict on
 * anything — so asking about the text FIRST is what stops the form announcing
 * «текст на модерації» to someone who has not written a word.
 */
function describeOwnText(review: OwnReviewEntity): string {
  if (!review.comment || review.comment.trim().length === 0) {
    return dict.reviews.addTextHint;
  }
  if (review.textStatus === OwnReviewEntityTextStatus.PENDING) {
    return dict.reviews.textPending;
  }
  if (review.textStatus === OwnReviewEntityTextStatus.REJECTED) {
    return dict.reviews.textRejected;
  }
  return dict.reviews.textApproved;
}

/**
 * SubmitReviewForm — the auth-gated review box under the PDP reviews list.
 *
 * Three states:
 *  - **Guest** — a login prompt carrying `?redirect=` back to this product.
 *  - **No review yet** — star rating + optional comment, POSTed for moderation.
 *  - **A review already left** (TASK-446, owner's decision 5) — the author adds
 *    or rewrites the TEXT via PATCH. The rating is shown but not editable: the
 *    API refuses a rating change outright (`forbidNonWhitelisted` 400s on a body
 *    carrying `rating`), so offering an inert star row would be offering
 *    something that cannot work. A line of copy says why instead.
 *
 * Before TASK-446 the second and third states were the same state: the form only
 * ever POSTed, and the 409 it earned said «Ви вже залишили відгук» and stopped
 * there — a shopper who rated in one click could never come back and say why.
 *
 * Form-state sync follows `docs/conventions/forms.md` Rule 2a: the seed comes
 * from an async query, so it is applied through RHF's `values` with
 * `keepDirtyValues`, never through bare `defaultValues` and never by remounting
 * the textarea on a `key` (which would drop focus mid-sentence).
 */
export function SubmitReviewForm({ productId }: SubmitReviewFormProps) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const submit = useReviewControllerSubmit();
  const update = useReviewControllerUpdate();
  const pathname = usePathname();

  // Guests must not ask: the endpoint is auth-only, and an unauthenticated call
  // would be a guaranteed 401 on every PDP view.
  const { data: mine } = useReviewControllerMine(productId, {
    query: { enabled: isAuthenticated },
  });
  const existing = mine?.data ?? null;

  // Send the guest back to the product they were reading (TASK-419). The bare
  // "/login" this used to point at dropped the shopper on the homepage after a
  // successful sign-in — the review they came to write was several clicks away
  // again, and nothing said where it went. Both auth forms already honour
  // `?redirect=` and re-check that it is a same-origin path, so only a path is
  // ever put in the URL here; `usePathname()` yields exactly that (no origin,
  // no query), and null only outside a router, where the plain link is right.
  const loginHref = pathname
    ? `/login?redirect=${encodeURIComponent(pathname)}`
    : "/login";

  const {
    register,
    handleSubmit,
    setValue,
    control,
    reset,
    formState: { errors, isDirty },
  } = useForm<ReviewFormValues>({
    resolver: zodResolver(reviewSchema),
    // forms.md Rule 2a — live-sync from the async source. A background refetch
    // refreshes untouched fields; `keepDirtyValues` protects a half-typed edit.
    values: existing
      ? { rating: existing.rating, comment: existing.comment ?? "" }
      : EMPTY_REVIEW,
    resetOptions: { keepDirtyValues: true },
  });

  // Clear the form when navigating between PDPs (forms.md Rule 2b). This cannot
  // be left to `values` alone: `keepDirtyValues` would carry a half-written
  // comment from one product to the next, which is the very leak Rule 2b names.
  //
  // The ref guard is what makes the two rules coexist. An unguarded effect also
  // fires on MOUNT, and would blank a form that `values` had just seeded from a
  // warm cache — RHF only re-applies `values` when their CONTENT changes, so the
  // seed would never come back.
  const lastProductIdRef = useRef(productId);
  useEffect(() => {
    if (lastProductIdRef.current === productId) return;
    lastProductIdRef.current = productId;
    reset(EMPTY_REVIEW);
  }, [productId, reset]);

  // `useWatch` (not `watch()`) keeps the component memoizable under the React
  // Compiler while still re-rendering the star row as the rating changes.
  const rating = useWatch({ control, name: "rating" });
  const comment = useWatch({ control, name: "comment" });

  if (!isAuthenticated) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        {dict.reviews.loginToReview}{" "}
        <Link
          href={loginHref}
          className="font-medium text-primary hover:underline"
        >
          {dict.reviews.loginLink}
        </Link>
      </div>
    );
  }

  // The list is cached per page (`[url, {page, limit}]`), so invalidate by the
  // bare URL key and let React Query's prefix match reach every page at once.
  const invalidateReviews = () => {
    void queryClient.invalidateQueries({
      queryKey: getReviewControllerListQueryKey(productId),
    });
    void queryClient.invalidateQueries({
      queryKey: getReviewControllerMineQueryKey(productId),
    });
  };

  const onSubmit = (formValues: ReviewFormValues) => {
    const text = (formValues.comment ?? "").trim();

    if (existing) {
      update.mutate(
        { id: existing.id, data: { comment: text } },
        {
          onSuccess: () => {
            toast.success(dict.reviews.updateSuccess);
            // Re-baseline rather than clear: the text stays on screen, but it is
            // pristine again, so the save button settles and a later refetch can
            // sync it instead of being held off by `keepDirtyValues`.
            reset({ rating: existing.rating, comment: text });
            invalidateReviews();
          },
          onError: () => toast.error(dict.reviews.updateError),
        },
      );
      return;
    }

    submit.mutate(
      {
        productId,
        data: { rating: formValues.rating, comment: text || undefined },
      },
      {
        onSuccess: () => {
          toast.success(dict.reviews.submitSuccess);
          reset(EMPTY_REVIEW);
          invalidateReviews();
        },
        onError: (error) => {
          if (error?.response?.status === 409) {
            toast.error(dict.reviews.alreadyReviewed);
            // A 409 means a review exists that this form did not know about — a
            // second tab, a stale `mine`. Refetch it so the form flips to the
            // edit affordance instead of returning to the old dead end.
            void queryClient.invalidateQueries({
              queryKey: getReviewControllerMineQueryKey(productId),
            });
            return;
          }
          toast.error(dict.reviews.submitError);
        },
      },
    );
  };

  // Surface the 409 inline as well (in addition to the toast) for clarity.
  const alreadyReviewed = submit.error?.response?.status === 409;
  const isSaving = existing ? update.isPending : submit.isPending;
  // An empty box must not be savable: the API reads `comment: ""` as «erase it»,
  // which would wipe a published text AND drop it back into the queue. Requiring
  // a real change also stops an identical re-save costing an APPROVED text its
  // verdict for nothing.
  const canSaveText = isDirty && (comment ?? "").trim().length > 0;

  // The two modes differ in every label, so name them once rather than nesting
  // a ternary inside a ternary inside JSX.
  const submitLabel = existing
    ? isSaving
      ? dict.reviews.saving
      : dict.reviews.saveText
    : isSaving
      ? dict.reviews.submitting
      : dict.reviews.submitReview;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-3 rounded-lg border border-border p-4"
      noValidate
    >
      <p className="text-sm font-semibold text-foreground">
        {existing ? dict.reviews.yourReview : dict.reviews.leaveReview}
      </p>

      {existing ? (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-foreground">
            {dict.reviews.ratingLabel}
          </span>
          <ReviewRatingStars rating={existing.rating} size="lg" />
          <p className="text-xs text-muted-foreground">
            {dict.reviews.ratingLocked}
          </p>
        </div>
      ) : (
        <fieldset className="flex flex-col gap-1">
          <legend className="text-sm font-medium text-foreground">
            {dict.reviews.ratingLabel}
          </legend>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                aria-label={dict.reviews.starAria(value)}
                aria-pressed={rating >= value}
                aria-describedby={
                  errors.rating ? "review-rating-error" : undefined
                }
                onClick={() =>
                  setValue("rating", value, {
                    shouldValidate: true,
                    shouldDirty: true,
                  })
                }
                className="rounded p-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Star
                  className={
                    rating >= value
                      ? "size-6 text-amber-400"
                      : "size-6 text-muted-foreground/30"
                  }
                  fill="currentColor"
                  stroke="none"
                />
              </button>
            ))}
          </div>
          {errors.rating && (
            <p
              id="review-rating-error"
              role="alert"
              className="text-sm text-destructive"
            >
              {errors.rating.message}
            </p>
          )}
        </fieldset>
      )}

      {existing && (
        <p className="text-sm text-muted-foreground">
          {describeOwnText(existing)}
        </p>
      )}

      <div className="flex flex-col gap-1">
        <label
          htmlFor="review-comment"
          className="text-sm font-medium text-foreground"
        >
          {existing ? dict.reviews.textLabel : dict.reviews.commentLabel}
        </label>
        <Textarea
          id="review-comment"
          rows={3}
          placeholder={dict.reviews.commentPlaceholder}
          aria-describedby={existing ? "review-moderation-note" : undefined}
          {...register("comment")}
        />
        {/* Said BEFORE the author presses save, not after: an approved text
            going back into the queue is a consequence they should be able to
            decline. */}
        {existing && (
          <p
            id="review-moderation-note"
            className="text-xs text-muted-foreground"
          >
            {dict.reviews.editResetsModeration}
          </p>
        )}
      </div>

      {alreadyReviewed && (
        <p role="alert" className="text-sm text-destructive">
          {dict.reviews.alreadyReviewed}
        </p>
      )}

      <Button
        type="submit"
        disabled={isSaving || (existing ? !canSaveText : false)}
        className="self-start"
      >
        {submitLabel}
      </Button>
    </form>
  );
}
