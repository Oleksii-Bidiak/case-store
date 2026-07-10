"use client";

import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Checkbox,
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
import { AttributeDefinitionEntityType } from "@/entities/attribute-definition";
import {
  attributeDefinitionSchema,
  EMPTY_ATTRIBUTE_DEFINITION,
  type AttributeDefinitionFormValues,
} from "../model/attribute-definition-schema";

const d = dict.attributeDefinitions;

const TYPE_LABELS: Record<AttributeDefinitionEntityType, string> = {
  [AttributeDefinitionEntityType.TEXT]: d.typeText,
  [AttributeDefinitionEntityType.NUMBER]: d.typeNumber,
  [AttributeDefinitionEntityType.BOOLEAN]: d.typeBoolean,
  [AttributeDefinitionEntityType.SELECT]: d.typeSelect,
};

interface AttributeDefinitionFormProps {
  defaultValues?: Partial<AttributeDefinitionFormValues>;
  onSubmit: (values: AttributeDefinitionFormValues) => void;
  onCancel: () => void;
  isPending: boolean;
  submitLabel: string;
}

/**
 * Create/edit form for a single structured-spec template (TASK-191). The
 * `options` textarea is conditionally shown only for SELECT-typed definitions,
 * matching the backend's "SELECT requires options" rule.
 */
export function AttributeDefinitionForm({
  defaultValues,
  onSubmit,
  onCancel,
  isPending,
  submitLabel,
}: AttributeDefinitionFormProps) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<AttributeDefinitionFormValues>({
    resolver: zodResolver(attributeDefinitionSchema),
    defaultValues: { ...EMPTY_ATTRIBUTE_DEFINITION, ...defaultValues },
  });

  const type = useWatch({ control, name: "type" });
  const isSelect = type === AttributeDefinitionEntityType.SELECT;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
      noValidate
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="attr-key">{d.key}</Label>
          <Input
            id="attr-key"
            placeholder={d.keyPlaceholder}
            {...register("key")}
          />
          {errors.key && (
            <p role="alert" className="text-sm text-destructive">
              {errors.key.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="attr-label">{d.label}</Label>
          <Input
            id="attr-label"
            placeholder={d.labelPlaceholder}
            {...register("label")}
          />
          {errors.label && (
            <p role="alert" className="text-sm text-destructive">
              {errors.label.message}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="attr-type">{d.type}</Label>
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="attr-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(AttributeDefinitionEntityType).map((value) => (
                    <SelectItem key={value} value={value}>
                      {TYPE_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="attr-unit">{d.unit}</Label>
          <Input
            id="attr-unit"
            placeholder={d.unitPlaceholder}
            {...register("unit")}
          />
          {errors.unit && (
            <p role="alert" className="text-sm text-destructive">
              {errors.unit.message}
            </p>
          )}
        </div>
      </div>

      {isSelect && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="attr-options">{d.options}</Label>
          <Textarea
            id="attr-options"
            rows={4}
            placeholder={d.optionsPlaceholder}
            {...register("options")}
          />
          {errors.options && (
            <p role="alert" className="text-sm text-destructive">
              {errors.options.message}
            </p>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Controller
          control={control}
          name="isFilterable"
          render={({ field }) => (
            <Checkbox
              id="attr-filterable"
              checked={field.value}
              onCheckedChange={(checked) => field.onChange(checked === true)}
            />
          )}
        />
        <Label htmlFor="attr-filterable">{d.isFilterable}</Label>
      </div>

      <FormActionsBar className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isPending}
        >
          {d.cancel}
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? d.saving : submitLabel}
        </Button>
      </FormActionsBar>
    </form>
  );
}
