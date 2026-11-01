"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as Sentry from "@sentry/nextjs";
import { Tag, X } from "lucide-react";
import {
  usePreviewDiscount,
  useAppliedDiscount,
  setAppliedDiscount,
  clearAppliedDiscount,
} from "@/entities/discount";
import { useAuth } from "@/entities/session";
import { dict } from "@/shared/config";
import {
  apiErrorCode,
  apiErrorMessage,
  apiErrorStatus,
  formatMoney,
} from "@/shared/lib";
import { Button, Input, Label } from "@/shared/ui";
import {
  discountSchema,
  type DiscountFormValues,
} from "../model/discount-schema";

/**
 * ApplyDiscount — the cart promo-code control.
 *
 * Customers enter a code, which is previewed against their current cart via the
 * `usePreviewDiscount` mutation. On success the computed discount is stored
 * (shared with checkout via the applied-discount store) and shown. Applying
 * replaces any prior code; "remove" clears it. The amount is advisory — the
 * server recomputes at order creation.
 *
 * ── Why the failure branches exist (TASK-402) ────────────────────────────────
 * The 2026-08-27 demo run reported "WELCOME10 не працює" because every failure,
 * whatever its cause, rendered the same "не вдалося застосувати промокод". The
 * control distinguishes the things that go wrong (stale CSRF session / rate
 * limit / the code itself) and records the status in a Sentry breadcrumb so the
 * next report carries the number with it.
 *
 * ── A guest's code (TASK-2010, B-12 тема 2 (в)) ──────────────────────────────
 * The preview works without a session now — the server prices the cart cookie
 * and answers `requiresAccount: true`. A code is still for accounts only, so a
 * guest sees the discount with «Застосується з акаунтом — створимо його під час
 * оформлення», and checkout ticks «Створити акаунт» for it. The old «Промокоди
 * доступні після входу» hint and the 401 → «Увійти» branch went with the
 * `JwtAuthGuard` that caused them.
 */
export function ApplyDiscount() {
  const applied = useAppliedDiscount();
  const { isAuthenticated, isInitializing } = useAuth();
  // Only once the session is resolved — an «з акаунтом» note that flashes at a
  // signed-in shopper during token refresh is its own small lie.
  const isGuest = !isInitializing && !isAuthenticated;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<DiscountFormValues>({
    resolver: zodResolver(discountSchema),
    defaultValues: { code: "" },
  });

  const preview = usePreviewDiscount({
    mutation: {
      onSuccess: (res) => {
        const data = res?.data;
        if (data) {
          setAppliedDiscount({
            code: data.code,
            amount: data.amount,
            newTotal: data.newTotal,
            requiresAccount: data.requiresAccount === true,
          });
          reset({ code: "" });
        }
      },
      onError: (error) => {
        // A breadcrumb, not an exception: a rejected promo code is normal
        // traffic. What was missing from the demo report was the status.
        Sentry.addBreadcrumb({
          category: "discount",
          message: "discount.preview.failed",
          level: "warning",
          data: {
            statusCode: apiErrorStatus(error),
            errorCode: apiErrorCode(error),
          },
        });
      },
    },
  });

  const onSubmit = (values: DiscountFormValues) => {
    preview.mutate({ data: { code: values.code } });
  };

  const onRemove = () => {
    clearAppliedDiscount();
    preview.reset();
  };

  // Typing a new code must clear the verdict on the old one — otherwise the
  // shopper edits the code while the previous attempt's error still sits under it.
  const codeField = register("code");

  const status = apiErrorStatus(preview.error);
  const errorCode = apiErrorCode(preview.error);
  const apiMessage = apiErrorMessage(preview.error);

  const errorMessage = !preview.isError
    ? null
    : status === 403
      ? dict.discounts.errors.forbidden
      : status === 429
        ? dict.discounts.errors.tooManyRequests
        : (errorCode && dict.discounts.errors[errorCode]) ||
          // The API's own sentence, but only for a 4xx: a 5xx message is
          // infrastructure English ("Internal server error"), not shopper copy.
          (status !== undefined && status < 500 ? apiMessage : undefined) ||
          dict.discounts.errors.generic;

  if (applied) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
          <span className="flex items-center gap-2 text-sm text-foreground">
            <Tag className="size-4 text-primary" aria-hidden="true" />
            {dict.discounts.appliedLabel(applied.code)}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            aria-label={dict.discounts.remove}
            className="text-muted-foreground hover:text-destructive"
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {dict.discounts.discountLine}
          </span>
          <span className="text-primary">−{formatMoney(applied.amount)}</span>
        </div>
        {/* The code holds only for an account's order (TASK-2010). */}
        {isGuest && applied.requiresAccount && (
          <p className="text-xs text-muted-foreground">
            {dict.discounts.requiresAccountNote}
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-2"
      noValidate
    >
      <Label
        htmlFor="discount-code"
        className="text-sm font-medium text-foreground"
      >
        {dict.discounts.title}
      </Label>
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <Input
            id="discount-code"
            placeholder={dict.discounts.placeholder}
            aria-label={dict.discounts.inputAria}
            aria-invalid={errors.code || errorMessage ? true : undefined}
            aria-describedby={
              [
                errors.code?.message ? "discount-code-error" : null,
                errorMessage ? "discount-code-api-error" : null,
              ]
                .filter(Boolean)
                .join(" ") || undefined
            }
            autoCapitalize="characters"
            {...codeField}
            onChange={(event) => {
              void codeField.onChange(event);
              if (preview.isError) preview.reset();
            }}
          />
          {errors.code?.message && (
            <p
              id="discount-code-error"
              role="alert"
              className="mt-1 text-sm text-destructive"
            >
              {errors.code.message}
            </p>
          )}
          {errorMessage && (
            <p
              id="discount-code-api-error"
              role="alert"
              className="mt-1 text-sm text-destructive"
            >
              {errorMessage}
            </p>
          )}
        </div>
        <Button type="submit" variant="outline" disabled={preview.isPending}>
          {preview.isPending ? dict.discounts.applying : dict.discounts.apply}
        </Button>
      </div>
    </form>
  );
}
