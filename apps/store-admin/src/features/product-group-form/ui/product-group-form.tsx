"use client";

import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { Button, Input, Label } from "@/shared/ui";
import { dict } from "@/shared/config";
import {
  productGroupSchema,
  type ProductGroupFormInput,
  type ProductGroupFormValues,
} from "../model/product-group-schema";

interface ProductGroupFormProps {
  defaultValues?: Partial<ProductGroupFormInput>;
  onSubmit: (values: ProductGroupFormValues) => void;
  isPending: boolean;
  submitLabel?: string;
}

/** Empty form baseline used for create mode and as the merge base in edit mode. */
const EMPTY_VALUES: ProductGroupFormInput = {
  name: "",
  axes: [],
  isActive: true,
};

/**
 * Reusable create/edit form for a product group: a name, an ordered list of
 * attribute axis names (add/remove/reorder by position), and an active flag.
 */
export function ProductGroupForm({
  defaultValues,
  onSubmit,
  isPending,
  submitLabel = dict.productGroupForm.submit,
}: ProductGroupFormProps) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ProductGroupFormInput, unknown, ProductGroupFormValues>({
    resolver: zodResolver(productGroupSchema),
    defaultValues: EMPTY_VALUES,
    values: defaultValues ? { ...EMPTY_VALUES, ...defaultValues } : undefined,
    resetOptions: { keepDirtyValues: true },
  });

  const {
    fields: axisFields,
    append: appendAxis,
    remove: removeAxis,
  } = useFieldArray({ control, name: "axes" });

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex max-w-2xl flex-col gap-5"
      noValidate
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="group-name">{dict.productGroupForm.name}</Label>
        <Input id="group-name" {...register("name")} />
        {errors.name && (
          <p role="alert" className="text-sm text-destructive">
            {errors.name.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label>{dict.productGroupForm.axes}</Label>
        <p className="text-sm text-muted-foreground">
          {dict.productGroupForm.axesHint}
        </p>
        <div className="flex flex-col gap-2">
          {axisFields.map((axisField, index) => (
            <div key={axisField.id} className="flex items-center gap-2">
              <Input
                aria-label={dict.productGroupForm.axisNameAria(index + 1)}
                placeholder={dict.productGroupForm.axisPlaceholder}
                {...register(`axes.${index}.name` as const)}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={dict.productGroupForm.removeAxisAria(index + 1)}
                onClick={() => removeAxis(index)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => appendAxis({ name: "" })}
        >
          <Plus className="size-4" />
          {dict.productGroupForm.addAxis}
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <input
          id="group-active"
          type="checkbox"
          className="size-4 rounded border-border accent-primary"
          {...register("isActive")}
        />
        <Label htmlFor="group-active">{dict.productGroupForm.active}</Label>
      </div>

      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? dict.common.saving : submitLabel}
        </Button>
      </div>
    </form>
  );
}
