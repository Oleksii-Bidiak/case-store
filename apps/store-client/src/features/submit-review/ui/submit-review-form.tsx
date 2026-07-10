"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/entities/session";
import {
  useReviewControllerSubmit,
  getReviewControllerListQueryKey,
} from "@/entities/review";
import { Button, Textarea } from "@/shared/ui";
import { dict } from "@/shared/config";
import { reviewSchema, type ReviewFormValues } from "../model/review-schema";

interface SubmitReviewFormProps {
  productId: string;
}

/**
 * SubmitReviewForm — auth-gated "leave a review" form rendered under the PDP
 * reviews list. Guests see a login prompt; authenticated users get a star-rating
 * input + optional comment. On success the review goes to moderation (it does
 * not appear immediately) and the reviews list query is invalidated.
 */
export function SubmitReviewForm({ productId }: SubmitReviewFormProps) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const submit = useReviewControllerSubmit();

  const {
    register,
    handleSubmit,
    setValue,
    control,
    reset,
    formState: { errors },
  } = useForm<ReviewFormValues>({
    resolver: zodResolver(reviewSchema),
    defaultValues: { rating: 0, comment: "" },
  });

  // Clear the form when navigating between products (forms.md Rule 2b): the form
  // is keyed to productId so a stale rating/comment never carries across PDPs.
  useEffect(() => {
    reset({ rating: 0, comment: "" });
  }, [productId, reset]);

  // `useWatch` (not `watch()`) keeps the component memoizable under the React
  // Compiler while still re-rendering the star row as the rating changes.
  const rating = useWatch({ control, name: "rating" });

  if (!isAuthenticated) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        {dict.reviews.loginToReview}{" "}
        <Link
          href="/login"
          className="font-medium text-primary hover:underline"
        >
          {dict.reviews.loginLink}
        </Link>
      </div>
    );
  }

  const onSubmit = (values: ReviewFormValues) => {
    submit.mutate(
      {
        productId,
        data: { rating: values.rating, comment: values.comment || undefined },
      },
      {
        onSuccess: () => {
          toast.success(dict.reviews.submitSuccess);
          reset({ rating: 0, comment: "" });
          queryClient.invalidateQueries({
            queryKey: getReviewControllerListQueryKey(productId),
          });
        },
        onError: (error) => {
          if (error?.response?.status === 409) {
            toast.error(dict.reviews.alreadyReviewed);
            return;
          }
          toast.error(dict.reviews.submitError);
        },
      },
    );
  };

  // Surface the 409 inline as well (in addition to the toast) for clarity.
  const alreadyReviewed = submit.error?.response?.status === 409;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-3 rounded-lg border border-border p-4"
      noValidate
    >
      <p className="text-sm font-semibold text-foreground">
        {dict.reviews.leaveReview}
      </p>

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
                setValue("rating", value, { shouldValidate: true })
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

      <div className="flex flex-col gap-1">
        <label
          htmlFor="review-comment"
          className="text-sm font-medium text-foreground"
        >
          {dict.reviews.commentLabel}
        </label>
        <Textarea
          id="review-comment"
          rows={3}
          placeholder={dict.reviews.commentPlaceholder}
          {...register("comment")}
        />
      </div>

      {alreadyReviewed && (
        <p role="alert" className="text-sm text-destructive">
          {dict.reviews.alreadyReviewed}
        </p>
      )}

      <Button type="submit" disabled={submit.isPending} className="self-start">
        {submit.isPending ? dict.reviews.submitting : dict.reviews.submitReview}
      </Button>
    </form>
  );
}
