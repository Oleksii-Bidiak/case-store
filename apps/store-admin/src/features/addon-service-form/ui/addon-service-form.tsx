"use client";

import { useEffect } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Callout,
  FieldError,
  FormAlert,
  Input,
  Label,
  Switch,
  Textarea,
} from "@/shared/ui";
import { cn } from "@/shared/lib/utils";
import { dict } from "@/shared/config";
import {
  ADDON_DESCRIPTION_MAX,
  addonServiceSchema,
  type AddonServiceFormInput,
  type AddonServiceFormValues,
} from "../model/addon-service-schema";

const f = dict.addonServiceForm;

interface AddonServiceFormProps {
  /**
   * Entity id (edit mode). Drives the forms.md Rule 2b reset: the form re-seeds
   * from `defaultValues` only when navigating to a DIFFERENT service, never on a
   * background refetch. Omitted in create mode.
   */
  id?: string;
  defaultValues?: Partial<AddonServiceFormInput>;
  onSubmit: (values: AddonServiceFormValues) => void;
  isPending: boolean;
  submitLabel?: string;
  /** «Скасувати» (or «Закрити» when read-only). */
  onCancel?: () => void;
  /** No `addons:write`: fields disabled, nothing to save (wave 191 canon). */
  readOnly?: boolean;
}

/** Empty baseline used for create mode and as the merge base in edit mode. */
const EMPTY_VALUES: AddonServiceFormInput = {
  name: "",
  description: "",
  price: "",
  isActive: true,
};

const errorId = (field: string) => `addon-${field}-error`;

/**
 * Create/edit form of an add-on service (TASK-174) as the body of its dialog
 * (wave 198, AddonServicesProposal ДП4–ДП7): the required name and price, the
 * customer-facing description with its counter, the price with «₴» inside the
 * field, and «Показувати в кошику» as a Switch.
 *
 * A field's error stands WHERE its hint stood (form canon 1.5) — the price hint
 * and «Вкажіть ціну…» are never on screen together.
 *
 * Not drawn, because the API has no such data yet (wave 198 API tails):
 * «Повертається разом із товаром» (TASK-949 — no `AddonService` field), the
 * «Де пропонується» summary, and «Видалити…» (no delete endpoint, no purchase
 * count).
 */
export function AddonServiceForm({
  id,
  defaultValues,
  onSubmit,
  isPending,
  submitLabel = f.submit,
  onCancel,
  readOnly = false,
}: AddonServiceFormProps) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, submitCount },
  } = useForm<AddonServiceFormInput, unknown, AddonServiceFormValues>({
    resolver: zodResolver(addonServiceSchema),
    defaultValues: { ...EMPTY_VALUES, ...defaultValues },
  });

  // forms.md Rule 2b: re-seed only when navigating to a different entity (`id`
  // changes), NOT on every render or background refetch.
  useEffect(() => {
    if (id && defaultValues) {
      reset({ ...EMPTY_VALUES, ...defaultValues });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const description = useWatch({ control, name: "description" }) ?? "";
  const errorCount = [errors.name, errors.description, errors.price].filter(
    Boolean,
  ).length;

  const describedBy = (...ids: Array<string | false | undefined>) =>
    ids.filter(Boolean).join(" ") || undefined;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
      noValidate
    >
      {readOnly ? (
        <Callout variant="strip">{dict.common.viewOnly}</Callout>
      ) : null}
      {submitCount > 0 && errorCount > 0 ? (
        <FormAlert>{f.formAlert(errorCount)}</FormAlert>
      ) : null}

      <fieldset disabled={readOnly} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="addon-name" required>
            {f.name}
          </Label>
          <Input
            id="addon-name"
            aria-required="true"
            placeholder={f.namePlaceholder}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={describedBy(errors.name && errorId("name"))}
            {...register("name")}
          />
          <FieldError id={errorId("name")}>{errors.name?.message}</FieldError>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="addon-description">{f.description}</Label>
          <Textarea
            id="addon-description"
            rows={2}
            placeholder={f.descriptionPlaceholder}
            aria-invalid={errors.description ? true : undefined}
            aria-describedby={describedBy(
              errors.description
                ? errorId("description")
                : "addon-description-hint",
            )}
            {...register("description")}
          />
          <div className="flex items-start justify-between gap-3">
            {errors.description ? (
              <FieldError id={errorId("description")}>
                {errors.description.message}
              </FieldError>
            ) : (
              <p
                id="addon-description-hint"
                className="text-xs text-muted-foreground"
              >
                {f.descriptionHint}
              </p>
            )}
            <Counter
              label={f.description}
              count={description.length}
              max={ADDON_DESCRIPTION_MAX}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="addon-price" required>
            {f.price}
          </Label>
          <div className="relative w-full max-w-45">
            <Input
              id="addon-price"
              type="text"
              inputMode="decimal"
              aria-required="true"
              className="pr-8 tabular-nums"
              aria-invalid={errors.price ? true : undefined}
              aria-describedby={describedBy(
                errors.price ? errorId("price") : "addon-price-hint",
              )}
              {...register("price")}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground"
            >
              {f.currency}
            </span>
          </div>
          {errors.price ? (
            <FieldError id={errorId("price")}>
              {errors.price.message}
            </FieldError>
          ) : (
            <p id="addon-price-hint" className="text-xs text-muted-foreground">
              {f.priceHint}
            </p>
          )}
        </div>

        <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
          <div className="flex min-w-0 flex-col gap-1">
            <Label htmlFor="addon-active">{f.active}</Label>
            <p id="addon-active-hint" className="text-xs text-muted-foreground">
              {f.activeHint}
            </p>
          </div>
          <Controller
            control={control}
            name="isActive"
            render={({ field }) => (
              <Switch
                id="addon-active"
                checked={field.value ?? true}
                onCheckedChange={field.onChange}
                onBlur={field.onBlur}
                aria-describedby="addon-active-hint"
                className="mt-0.5 shrink-0"
              />
            )}
          />
        </div>
      </fieldset>

      <div className="-mx-6 mt-2 flex flex-col-reverse gap-2 border-t px-6 pt-4 md:flex-row md:justify-end">
        {onCancel ? (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="max-md:h-11"
          >
            {readOnly ? dict.common.close : dict.common.cancel}
          </Button>
        ) : null}
        {readOnly ? null : (
          <Button type="submit" disabled={isPending} className="max-md:h-11">
            {isPending ? dict.common.saving : submitLabel}
          </Button>
        )}
      </div>
    </form>
  );
}

/** «74 / 300» next to the hint; read in full by a screen reader. */
function Counter({
  label,
  count,
  max,
}: {
  label: string;
  count: number;
  max: number;
}) {
  return (
    <span
      className={cn(
        "shrink-0 text-xs tabular-nums",
        count > max ? "text-destructive" : "text-muted-foreground",
      )}
    >
      <span aria-hidden="true">{f.counter(count, max)}</span>
      <span className="sr-only">{f.counterAria(label, count, max)}</span>
    </span>
  );
}
