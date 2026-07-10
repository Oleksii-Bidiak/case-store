"use client";

import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { slugify } from "@/shared/lib";
import { Button, FormActionsBar, Input, Label } from "@/shared/ui";
import { dict } from "@/shared/config";
import {
  brandSchema,
  type BrandFormInput,
  type BrandFormValues,
} from "../model/brand-schema";

interface BrandFormProps {
  /** Entity id (edit mode). Drives the forms.md Rule 2b reset: the form
   *  re-seeds from `defaultValues` only when navigating to a different brand,
   *  never on a background refetch. Omitted in create mode. */
  id?: string;
  defaultValues?: Partial<BrandFormInput>;
  onSubmit: (values: BrandFormValues) => void;
  isPending: boolean;
  submitLabel?: string;
}

/** Empty form baseline used for create mode and as the merge base in edit mode. */
const EMPTY_VALUES: BrandFormInput = {
  name: "",
  slug: "",
  logo: "",
  isActive: true,
};

/**
 * Reusable create/edit brand form: name, slug (with live auto-slug preview),
 * logo URL, and the active toggle.
 */
export function BrandForm({
  id,
  defaultValues,
  onSubmit,
  isPending,
  submitLabel = dict.brandForm.submit,
}: BrandFormProps) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<BrandFormInput, unknown, BrandFormValues>({
    resolver: zodResolver(brandSchema),
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

  // Live slug preview: when the slug field is blank, show what the backend would
  // auto-derive from the name (the `slugify` port mirrors the server's
  // `generateSlug`). Pure render-time computation — no state, no side effects.
  const nameValue = useWatch({ control, name: "name" });
  const slugValue = useWatch({ control, name: "slug" });

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex max-w-2xl flex-col gap-5"
      noValidate
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="brand-name">{dict.brandForm.name}</Label>
        <Input id="brand-name" {...register("name")} />
        {errors.name && (
          <p role="alert" className="text-sm text-destructive">
            {errors.name.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="brand-slug">{dict.brandForm.slug}</Label>
        <Input
          id="brand-slug"
          placeholder={dict.brandForm.slugPlaceholder}
          {...register("slug")}
        />
        {!slugValue && (nameValue?.trim().length ?? 0) > 0 && (
          <p
            className="text-sm text-muted-foreground"
            data-testid="slug-preview"
          >
            {dict.brandForm.slugPreview(slugify(nameValue ?? ""))}
          </p>
        )}
        {errors.slug && (
          <p role="alert" className="text-sm text-destructive">
            {errors.slug.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="brand-logo">{dict.brandForm.logo}</Label>
        <Input
          id="brand-logo"
          placeholder={dict.brandForm.logoPlaceholder}
          {...register("logo")}
        />
        {errors.logo && (
          <p role="alert" className="text-sm text-destructive">
            {errors.logo.message}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          id="brand-active"
          type="checkbox"
          className="size-4 rounded border-border accent-primary"
          {...register("isActive")}
        />
        <Label htmlFor="brand-active">{dict.brandForm.active}</Label>
      </div>

      <FormActionsBar>
        <Button type="submit" disabled={isPending}>
          {isPending ? dict.common.saving : submitLabel}
        </Button>
      </FormActionsBar>
    </form>
  );
}
