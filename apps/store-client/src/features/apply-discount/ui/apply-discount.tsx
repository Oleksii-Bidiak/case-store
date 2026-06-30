"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Tag, X } from "lucide-react";
import { usePreviewDiscount } from "@/entities/discount";
import { dict } from "@/shared/config";
import { formatMoney } from "@/shared/lib";
import { Button, Input, Label } from "@/shared/ui";
import {
  discountSchema,
  type DiscountFormValues,
} from "../model/discount-schema";
import {
  useAppliedDiscount,
  setAppliedDiscount,
  clearAppliedDiscount,
} from "../model/applied-discount-store";

/**
 * Shape of the API error envelope body (HttpExceptionFilter): `error` carries
 * the stable DISCOUNT_* code we map to a localized message.
 */
interface DiscountErrorBody {
  error?: string;
}

/**
 * ApplyDiscount — the cart promo-code control.
 *
 * Customers enter a code, which is previewed against their current cart via the
 * `usePreviewDiscount` mutation. On success the computed discount is stored
 * (shared with checkout via the applied-discount store) and shown; a typed error
 * code is mapped to a friendly, localized message. Applying replaces any prior
 * code; "remove" clears it. The amount is advisory — the server recomputes at
 * order creation.
 */
export function ApplyDiscount() {
  const applied = useAppliedDiscount();

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
          });
          reset({ code: "" });
        }
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

  // Map the typed API error code → localized message (fallback to generic).
  const apiErrorCode = (
    preview.error?.response?.data as DiscountErrorBody | undefined
  )?.error;
  const apiErrorMessage = preview.isError
    ? (apiErrorCode && dict.discounts.errors[apiErrorCode]) ||
      dict.discounts.errors.generic
    : null;

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
            aria-invalid={errors.code || apiErrorMessage ? true : undefined}
            autoCapitalize="characters"
            {...register("code")}
          />
          {errors.code?.message && (
            <p role="alert" className="mt-1 text-sm text-destructive">
              {errors.code.message}
            </p>
          )}
          {apiErrorMessage && (
            <p role="alert" className="mt-1 text-sm text-destructive">
              {apiErrorMessage}
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
