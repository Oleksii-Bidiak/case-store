import { z } from "zod";
import type { CreateProductGroupDto } from "@/entities/product-group";

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
    .min(1, "Name is required")
    .max(255, "Name must be at most 255 characters"),

  axes: z.array(z.object({ name: z.string().trim() })).optional(),

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
