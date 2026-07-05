import { z } from "zod";
import { dict } from "@/shared/config";
import {
  AttributeDefinitionEntityType,
  type CreateAttributeDefinitionDto,
} from "@/entities/attribute-definition";

const t = dict.attributeDefinitions.errors;

/**
 * Same stable-token pattern the backend enforces (`ATTRIBUTE_KEY_PATTERN`):
 * starts with a letter, then letters / digits / hyphens, no spaces.
 */
export const ATTRIBUTE_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9-]*$/;

const TYPES = [
  AttributeDefinitionEntityType.TEXT,
  AttributeDefinitionEntityType.NUMBER,
  AttributeDefinitionEntityType.BOOLEAN,
  AttributeDefinitionEntityType.SELECT,
] as const;

/**
 * Form schema for a single structured-spec template. `options` is edited as a
 * newline-separated string and split into an array on submit; it is required
 * (non-empty) when the type is SELECT — mirroring the backend rule.
 */
export const attributeDefinitionSchema = z
  .object({
    key: z
      .string()
      .min(1, t.keyRequired)
      .max(60, t.keyMax)
      .regex(ATTRIBUTE_KEY_PATTERN, t.keyPattern),
    label: z.string().min(1, t.labelRequired).max(120, t.labelMax),
    type: z.enum(TYPES),
    unit: z.string().max(20, t.unitMax),
    options: z.string(),
    isFilterable: z.boolean(),
  })
  .superRefine((values, ctx) => {
    if (values.type === AttributeDefinitionEntityType.SELECT) {
      const parsed = splitOptions(values.options);
      if (parsed.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["options"],
          message: t.optionsRequired,
        });
      }
    }
  });

export type AttributeDefinitionFormValues = z.infer<
  typeof attributeDefinitionSchema
>;

/** Split the newline-separated options textarea into a trimmed, non-empty array. */
export function splitOptions(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Build the create/update request body from validated form values. */
export function formValuesToDto(
  values: AttributeDefinitionFormValues,
): CreateAttributeDefinitionDto {
  const isSelect = values.type === AttributeDefinitionEntityType.SELECT;
  return {
    key: values.key.trim(),
    label: values.label.trim(),
    type: values.type,
    unit: values.unit.trim() === "" ? null : values.unit.trim(),
    options: isSelect ? splitOptions(values.options) : undefined,
    isFilterable: values.isFilterable,
  };
}

/** Baseline empty values for the create form. */
export const EMPTY_ATTRIBUTE_DEFINITION: AttributeDefinitionFormValues = {
  key: "",
  label: "",
  type: AttributeDefinitionEntityType.TEXT,
  unit: "",
  options: "",
  isFilterable: false,
};
