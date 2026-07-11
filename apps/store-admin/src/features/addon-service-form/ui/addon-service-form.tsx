"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, FormActionsBar, Input, Label, Textarea } from "@/shared/ui";
import { dict } from "@/shared/config";
import {
  addonServiceSchema,
  type AddonServiceFormInput,
  type AddonServiceFormValues,
} from "../model/addon-service-schema";

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
}

/** Empty baseline used for create mode and as the merge base in edit mode. */
const EMPTY_VALUES: AddonServiceFormInput = {
  name: "",
  description: "",
  price: "",
  isActive: true,
};

/**
 * Reusable create/edit form for an add-on service (TASK-174): name, customer-
 * facing description, price, and the reversible active toggle.
 *
 * Deactivating a service withdraws it from every category template and product
 * delta at once — the hint below says so, because that is not obvious from a
 * checkbox labelled "активна".
 */
export function AddonServiceForm({
  id,
  defaultValues,
  onSubmit,
  isPending,
  submitLabel = dict.addonServiceForm.submit,
}: AddonServiceFormProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AddonServiceFormInput, unknown, AddonServiceFormValues>({
    resolver: zodResolver(addonServiceSchema),
    defaultValues: EMPTY_VALUES,
  });

  // forms.md Rule 2b: re-seed only when navigating to a different entity (`id`
  // changes), NOT on every render or background refetch.
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
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="addon-name">{dict.addonServiceForm.name}</Label>
        <Input id="addon-name" {...register("name")} />
        {errors.name && (
          <p role="alert" className="text-sm text-destructive">
            {errors.name.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="addon-description">
          {dict.addonServiceForm.description}
        </Label>
        <Textarea
          id="addon-description"
          rows={3}
          placeholder={dict.addonServiceForm.descriptionPlaceholder}
          {...register("description")}
        />
        {errors.description && (
          <p role="alert" className="text-sm text-destructive">
            {errors.description.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="addon-price">{dict.addonServiceForm.price}</Label>
        <Input
          id="addon-price"
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          {...register("price")}
        />
        <p className="text-sm text-muted-foreground">
          {dict.addonServiceForm.priceHint}
        </p>
        {errors.price && (
          <p role="alert" className="text-sm text-destructive">
            {errors.price.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <input
            id="addon-active"
            type="checkbox"
            className="size-4 rounded border-border accent-primary"
            {...register("isActive")}
          />
          <Label htmlFor="addon-active">{dict.addonServiceForm.active}</Label>
        </div>
        <p className="text-sm text-muted-foreground">
          {dict.addonServiceForm.activeHint}
        </p>
      </div>

      <FormActionsBar>
        <Button type="submit" disabled={isPending}>
          {isPending ? dict.common.saving : submitLabel}
        </Button>
      </FormActionsBar>
    </form>
  );
}
