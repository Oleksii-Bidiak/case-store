import { z } from "zod";
import type { UseFormSetError } from "react-hook-form";
import type { CreateProductGroupDto } from "@/entities/product-group";
import { dict } from "@/shared/config";
import { apiErrorStatus } from "@/shared/lib";
import {
  applyServerFieldErrors,
  type ServerFieldMap,
} from "@/shared/lib/form-errors";

const e = dict.productGroupForm.errors;

/**
 * The DTOs' `@MaxLength` caps — `name` from `create-product-group.dto.ts`, an
 * axis name from `product-group-axis-input.dto.ts` (apps/store-api/src/
 * product-group/dto). Read by the schema and the inputs (TASK-1984, Rule 5d).
 */
export const PRODUCT_GROUP_LIMITS = { name: 255, axisName: 50 } as const;

/**
 * DTO paths → form fields (Rule 6b). An axis refusal goes on the whole list,
 * not on a row: the payload drops blank rows, so the server's `axes.N` index
 * need not be the row the operator sees as N.
 */
const PRODUCT_GROUP_FIELD_MAP: ServerFieldMap = {
  name: "name",
  axes: "axes",
  "axes.*": "axes",
};

/**
 * Puts a refused product-group save under its field (TASK-1984, Rule 6b) and
 * says whether it did — `false` leaves the toast to the caller.
 */
export function placeProductGroupSaveError(
  error: unknown,
  setError: UseFormSetError<ProductGroupFormInput>,
): boolean {
  if (apiErrorStatus(error) !== 400) return false;
  const { mapped, unmapped } = applyServerFieldErrors(
    error,
    setError,
    PRODUCT_GROUP_FIELD_MAP,
  );
  return mapped.length > 0 && unmapped.length === 0;
}

/**
 * Validation schema for the admin product-group form (TASK-142).
 *
 * Axes are edited as an ordered list of `{ name }` rows; their position in the
 * array becomes the `sortOrder` on submit. Blank axis names are dropped.
 */
export const productGroupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, e.nameRequired)
    .max(PRODUCT_GROUP_LIMITS.name, e.nameMax),

  // TASK-1984 (Rule 5d): `ProductGroupAxisInputDto.name` is `@MaxLength(50)`.
  axes: z
    .array(
      z.object({
        name: z.string().trim().max(PRODUCT_GROUP_LIMITS.axisName, e.axisMax),
      }),
    )
    .optional(),

  isActive: z.boolean().optional(),
});

export type ProductGroupFormInput = z.input<typeof productGroupSchema>;
export type ProductGroupFormValues = z.output<typeof productGroupSchema>;

/**
 * Map parsed form values to a create/update payload: trim axis names, drop
 * blanks, and assign each remaining axis a `sortOrder` from its position.
 */
export function productGroupFormValuesToDto(
  values: ProductGroupFormValues,
): CreateProductGroupDto {
  const axes = (values.axes ?? [])
    .map((axis) => axis.name.trim())
    .filter((name) => name.length > 0)
    .map((name, index) => ({ name, sortOrder: index }));

  return {
    name: values.name,
    axes,
    isActive: values.isActive,
  };
}
