"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, FormActionsBar, Input, Label } from "@/shared/ui";
import { dict } from "@/shared/config";
import {
  deviceBrandSchema,
  type DeviceBrandFormInput,
  type DeviceBrandFormValues,
} from "../model/device-brand-schema";

interface DeviceBrandFormProps {
  /** Entity id (edit mode) — drives the forms.md Rule 2b id-keyed reset. */
  id?: string;
  defaultValues?: Partial<DeviceBrandFormInput>;
  onSubmit: (values: DeviceBrandFormValues) => void;
  isPending: boolean;
  submitLabel?: string;
}

const EMPTY_VALUES: DeviceBrandFormInput = {
  name: "",
  slug: "",
  sortOrder: "0",
  isActive: true,
};

/** Reusable create/edit form for a device brand (TASK-190). */
export function DeviceBrandForm({
  id,
  defaultValues,
  onSubmit,
  isPending,
  submitLabel = dict.deviceBrandForm.submit,
}: DeviceBrandFormProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<DeviceBrandFormInput, unknown, DeviceBrandFormValues>({
    resolver: zodResolver(deviceBrandSchema),
    defaultValues: EMPTY_VALUES,
  });

  // forms.md Rule 2b: re-seed only when navigating to a different entity.
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
        <Label htmlFor="device-brand-name">{dict.deviceBrandForm.name}</Label>
        <Input id="device-brand-name" {...register("name")} />
        {errors.name && (
          <p role="alert" className="text-sm text-destructive">
            {errors.name.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="device-brand-slug">{dict.deviceBrandForm.slug}</Label>
        <Input
          id="device-brand-slug"
          placeholder={dict.deviceBrandForm.slugPlaceholder}
          {...register("slug")}
        />
        {errors.slug && (
          <p role="alert" className="text-sm text-destructive">
            {errors.slug.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="device-brand-sort">
          {dict.deviceBrandForm.sortOrder}
        </Label>
        <Input
          id="device-brand-sort"
          type="number"
          inputMode="numeric"
          min="0"
          step="1"
          {...register("sortOrder")}
        />
        {errors.sortOrder && (
          <p role="alert" className="text-sm text-destructive">
            {errors.sortOrder.message}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          id="device-brand-active"
          type="checkbox"
          className="size-4 rounded border-border accent-primary"
          {...register("isActive")}
        />
        <Label htmlFor="device-brand-active">
          {dict.deviceBrandForm.active}
        </Label>
      </div>

      <FormActionsBar>
        <Button type="submit" disabled={isPending}>
          {isPending ? dict.common.saving : submitLabel}
        </Button>
      </FormActionsBar>
    </form>
  );
}
