import { z } from "zod";
import type { OrderEntity, UpdateOrderDetailsDto } from "@/entities/order";
import { dict } from "@/shared/config";
import { nullableTextField } from "@/shared/lib";

const t = dict.orders;

/**
 * The two operator-editable fields that are not part of the order's lifecycle
 * (TASK-335 waybill, TASK-336 internal notes).
 *
 * Both are blank-to-clear: an empty box means "there is no waybill / no note",
 * which the API expresses as an explicit `null`. That is NOT the same as
 * omitting the key, which means "leave it alone" — so the mapper below always
 * sends both, and sends `null` rather than `""`.
 */
export const orderDetailsSchema = z.object({
  trackingNumber: z.string().trim().max(64, t.trackingNumberInvalid),
  internalNotes: z.string().trim().max(2000, t.internalNotesInvalid),
});

export type OrderDetailsFormValues = z.infer<typeof orderDetailsSchema>;

/** Seed the form from the order. Nulls become empty strings — RHF wants
 *  controlled string inputs, and `null` in a text box is a React warning. */
export function mapOrderToDetailsValues(
  order: Pick<OrderEntity, "trackingNumber" | "internalNotes">,
): OrderDetailsFormValues {
  return {
    trackingNumber: order.trackingNumber ?? "",
    internalNotes: order.internalNotes ?? "",
  };
}

/**
 * Map the form to the PATCH body, carrying the optimistic-lock token.
 *
 * `expectedUpdatedAt` is threaded through here rather than being optional
 * plumbing at the call site: a details write is the other half of edge case
 * E-11, and an operator who overwrites a colleague's waybill with their own has
 * lost exactly as much as one who overwrote a status.
 */
export function orderDetailsValuesToDto(
  values: OrderDetailsFormValues,
  expectedUpdatedAt: string,
): UpdateOrderDetailsDto {
  return {
    // `nullableTextField` is a cast, not a conversion — see its docblock for the
    // upstream Swagger artifact that makes these two fields arrive in the
    // generated client typed as objects rather than strings.
    trackingNumber: nullableTextField<UpdateOrderDetailsDto["trackingNumber"]>(
      values.trackingNumber,
    ),
    internalNotes: nullableTextField<UpdateOrderDetailsDto["internalNotes"]>(
      values.internalNotes,
    ),
    expectedUpdatedAt,
  };
}
