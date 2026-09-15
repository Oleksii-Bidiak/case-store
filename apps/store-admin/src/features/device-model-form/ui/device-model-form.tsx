"use client";

import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAdminDeviceControllerFindBrands } from "@/entities/device";
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
  Textarea,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import {
  deviceModelSchema,
  type DeviceModelFormInput,
  type DeviceModelFormValues,
} from "../model/device-model-schema";

interface DeviceModelFormProps {
  id?: string;
  defaultValues?: Partial<DeviceModelFormInput>;
  onSubmit: (values: DeviceModelFormValues) => void;
  isPending: boolean;
  submitLabel?: string;
}

const EMPTY_VALUES: DeviceModelFormInput = {
  deviceBrandId: "",
  name: "",
  slug: "",
  series: "",
  releaseYear: "",
  isActive: true,
  metaTitle: "",
  metaDescription: "",
  description: "",
};

/** Reusable create/edit form for a device model (TASK-190). */
export function DeviceModelForm({
  id,
  defaultValues,
  onSubmit,
  isPending,
  submitLabel = dict.deviceModelForm.submit,
}: DeviceModelFormProps) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<DeviceModelFormInput, unknown, DeviceModelFormValues>({
    resolver: zodResolver(deviceModelSchema),
    defaultValues: EMPTY_VALUES,
  });

  useEffect(() => {
    if (id && defaultValues) {
      reset({ ...EMPTY_VALUES, ...defaultValues });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const brandsQuery = useAdminDeviceControllerFindBrands();
  const brands = brandsQuery.data?.data ?? [];

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex max-w-2xl flex-col gap-5"
      noValidate
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="device-model-brand">{dict.deviceModelForm.brand}</Label>
        <Controller
          control={control}
          name="deviceBrandId"
          render={({ field }) => (
            <Select
              value={field.value ?? ""}
              onValueChange={(value) => {
                // Ignore Radix's hidden-native-select "" bounce (see the
                // category-form parent selector for the same guard).
                if (value === "") return;
                field.onChange(value);
              }}
            >
              <SelectTrigger id="device-model-brand">
                <SelectValue
                  placeholder={
                    brandsQuery.isLoading
                      ? dict.deviceModelForm.loading
                      : dict.deviceModelForm.brandPlaceholder
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {brands.map((brand) => (
                  <SelectItem key={brand.id} value={brand.id}>
                    {brand.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.deviceBrandId && (
          <p role="alert" className="text-sm text-destructive">
            {errors.deviceBrandId.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="device-model-name">{dict.deviceModelForm.name}</Label>
        <Input id="device-model-name" {...register("name")} />
        {errors.name && (
          <p role="alert" className="text-sm text-destructive">
            {errors.name.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="device-model-slug">{dict.deviceModelForm.slug}</Label>
        <Input
          id="device-model-slug"
          placeholder={dict.deviceModelForm.slugPlaceholder}
          {...register("slug")}
        />
        {errors.slug && (
          <p role="alert" className="text-sm text-destructive">
            {errors.slug.message}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="device-model-series">
            {dict.deviceModelForm.series}
          </Label>
          <Input
            id="device-model-series"
            placeholder={dict.deviceModelForm.seriesPlaceholder}
            {...register("series")}
          />
          {errors.series && (
            <p role="alert" className="text-sm text-destructive">
              {errors.series.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="device-model-year">
            {dict.deviceModelForm.releaseYear}
          </Label>
          <Input
            id="device-model-year"
            type="number"
            inputMode="numeric"
            min="1990"
            max="2100"
            step="1"
            {...register("releaseYear")}
          />
          {errors.releaseYear && (
            <p role="alert" className="text-sm text-destructive">
              {errors.releaseYear.message}
            </p>
          )}
        </div>
      </div>

      {/* TASK-490 — the copy of `/catalog/<категорія>/<модель>`. Grouped under
          its own heading because these three fields are the only ones on this
          form that do not describe the DEVICE: they describe the storefront
          pages the device appears on. Blank = the generated template. */}
      <fieldset className="flex flex-col gap-5 rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-semibold text-foreground">
          {dict.deviceModelForm.seoHeading}
        </legend>
        <p className="text-sm text-muted-foreground">
          {dict.deviceModelForm.seoHint}
        </p>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="device-model-meta-title">
            {dict.deviceModelForm.metaTitle}
          </Label>
          <Input
            id="device-model-meta-title"
            placeholder={dict.deviceModelForm.metaTitlePlaceholder}
            {...register("metaTitle")}
          />
          {errors.metaTitle && (
            <p role="alert" className="text-sm text-destructive">
              {errors.metaTitle.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="device-model-meta-description">
            {dict.deviceModelForm.metaDescription}
          </Label>
          <Textarea
            id="device-model-meta-description"
            rows={3}
            placeholder={dict.deviceModelForm.metaDescriptionPlaceholder}
            {...register("metaDescription")}
          />
          {errors.metaDescription && (
            <p role="alert" className="text-sm text-destructive">
              {errors.metaDescription.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="device-model-description">
            {dict.deviceModelForm.description}
          </Label>
          <Textarea
            id="device-model-description"
            rows={3}
            placeholder={dict.deviceModelForm.descriptionPlaceholder}
            {...register("description")}
          />
          {errors.description && (
            <p role="alert" className="text-sm text-destructive">
              {errors.description.message}
            </p>
          )}
        </div>
      </fieldset>

      <div className="flex items-center gap-2">
        <input
          id="device-model-active"
          type="checkbox"
          className="size-4 rounded border-border accent-primary"
          {...register("isActive")}
        />
        <Label htmlFor="device-model-active">
          {dict.deviceModelForm.active}
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
