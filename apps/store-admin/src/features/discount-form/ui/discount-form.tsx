"use client";

import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  FormActionsBar,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import {
  discountSchema,
  type DiscountFormInput,
  type DiscountFormValues,
} from "../model/discount-schema";

interface DiscountFormProps {
  /** Entity id (edit mode). Re-seeds the form only when navigating to a
   *  different discount (forms.md Rule 2b), never on background refetch. */
  id?: string;
  defaultValues?: Partial<DiscountFormInput>;
  onSubmit: (values: DiscountFormValues) => void;
  isPending: boolean;
  submitLabel?: string;
  /** In edit mode the code is immutable in the UI to avoid surprises. */
  lockCode?: boolean;
}

/** Empty form baseline for create mode and the merge base in edit mode. */
const EMPTY_VALUES: DiscountFormInput = {
  code: "",
  type: "PERCENT",
  value: "",
  minSpend: "",
  maxRedemptions: "",
  perUserLimit: "",
  startsAt: "",
  expiresAt: "",
  isActive: true,
};

/**
 * Reusable create/edit discount form. `value` semantics depend on `type`
 * (PERCENT: 1–100; FIXED: UAH amount); caps and the active window are optional.
 */
export function DiscountForm({
  id,
  defaultValues,
  onSubmit,
  isPending,
  submitLabel = dict.discountForm.submit,
  lockCode = false,
}: DiscountFormProps) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<DiscountFormInput, unknown, DiscountFormValues>({
    resolver: zodResolver(discountSchema),
    defaultValues: EMPTY_VALUES,
  });

  // forms.md Rule 2b: re-seed only when the edited entity id changes.
  useEffect(() => {
    if (id && defaultValues) {
      reset({ ...EMPTY_VALUES, ...defaultValues });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex max-w-2xl flex-col gap-5"
      noValidate
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="discount-code">{dict.discountForm.code}</Label>
          <Input
            id="discount-code"
            placeholder={dict.discountForm.codePlaceholder}
            autoCapitalize="characters"
            disabled={lockCode}
            {...register("code")}
          />
          {errors.code && (
            <p role="alert" className="text-sm text-destructive">
              {errors.code.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="discount-type">{dict.discountForm.type}</Label>
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="discount-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PERCENT">
                    {dict.discountForm.typePercent}
                  </SelectItem>
                  <SelectItem value="FIXED">
                    {dict.discountForm.typeFixed}
                  </SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="discount-value">{dict.discountForm.value}</Label>
          <Input
            id="discount-value"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            {...register("value")}
          />
          {errors.value && (
            <p role="alert" className="text-sm text-destructive">
              {errors.value.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="discount-min-spend">
            {dict.discountForm.minSpend}{" "}
            <span className="text-muted-foreground">
              {dict.discountForm.optional}
            </span>
          </Label>
          <Input
            id="discount-min-spend"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            {...register("minSpend")}
          />
          {errors.minSpend && (
            <p role="alert" className="text-sm text-destructive">
              {errors.minSpend.message}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="discount-max">
            {dict.discountForm.maxRedemptions}{" "}
            <span className="text-muted-foreground">
              {dict.discountForm.optional}
            </span>
          </Label>
          <Input
            id="discount-max"
            type="number"
            inputMode="numeric"
            min="1"
            step="1"
            {...register("maxRedemptions")}
          />
          {errors.maxRedemptions && (
            <p role="alert" className="text-sm text-destructive">
              {errors.maxRedemptions.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="discount-per-user">
            {dict.discountForm.perUserLimit}{" "}
            <span className="text-muted-foreground">
              {dict.discountForm.optional}
            </span>
          </Label>
          <Input
            id="discount-per-user"
            type="number"
            inputMode="numeric"
            min="1"
            step="1"
            {...register("perUserLimit")}
          />
          {errors.perUserLimit && (
            <p role="alert" className="text-sm text-destructive">
              {errors.perUserLimit.message}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="discount-starts">
            {dict.discountForm.startsAt}{" "}
            <span className="text-muted-foreground">
              {dict.discountForm.optional}
            </span>
          </Label>
          <Input id="discount-starts" type="date" {...register("startsAt")} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="discount-expires">
            {dict.discountForm.expiresAt}{" "}
            <span className="text-muted-foreground">
              {dict.discountForm.optional}
            </span>
          </Label>
          <Input id="discount-expires" type="date" {...register("expiresAt")} />
          {errors.expiresAt && (
            <p role="alert" className="text-sm text-destructive">
              {errors.expiresAt.message}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          id="discount-active"
          type="checkbox"
          className="size-4 rounded border-border accent-primary"
          {...register("isActive")}
        />
        <Label htmlFor="discount-active">{dict.discountForm.active}</Label>
      </div>

      <FormActionsBar>
        <Button type="submit" disabled={isPending}>
          {isPending ? dict.common.saving : submitLabel}
        </Button>
      </FormActionsBar>
    </form>
  );
}
