import { z } from "zod";
import { RESTOCK_ON_STATUS, type ResolveReturnDto } from "@/entities/return";
import { dict } from "@/shared/config";
import { nullableTextField } from "@/shared/lib";

const t = dict.returns;

/**
 * The operator's decision on a return (TASK-340).
 *
 * `refundedAmount` is a decimal STRING, matching the backend's `@Matches`
 * pattern, for the reason every money field in this project is a string: a float
 * cannot hold 0.10, and nobody notices until the day's totals disagree by a
 * kopiyka. It is validated here rather than left to a 400 so the operator finds
 * out while the number is still under their cursor.
 */
export const resolveReturnSchema = z.object({
  status: z.string().min(1),
  operatorNotes: z.string().trim().max(2000),
  refundedAmount: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || /^\d{1,8}(\.\d{1,2})?$/.test(value),
      t.resolveRefundedAmountInvalid,
    ),
  restock: z.boolean(),
});

export type ResolveReturnFormValues = z.infer<typeof resolveReturnSchema>;

/**
 * Whether crediting the goods back to sellable stock is even a question.
 *
 * Only at RECEIVED, and only once. The backend refuses anything else, but the
 * checkbox is hidden rather than merely refused: an operator ticking a box that
 * cannot apply is being invited to believe stock came back when it did not.
 */
export function canRestock(
  targetStatus: string,
  alreadyRestockedAt: string | null,
): boolean {
  return targetStatus === RESTOCK_ON_STATUS && alreadyRestockedAt === null;
}

/**
 * Map the form to the PATCH body.
 *
 * `restock` is sent only when it is true AND applicable. Sending `false`
 * explicitly would be harmless today, but the flag means "credit the stock now",
 * and a request that carries it on a REFUNDED transition reads like an intent
 * the operator never had.
 */
export function resolveValuesToDto(
  values: ResolveReturnFormValues,
  alreadyRestockedAt: string | null,
): ResolveReturnDto {
  const restock =
    values.restock && canRestock(values.status, alreadyRestockedAt);

  return {
    status: values.status as ResolveReturnDto["status"],
    // See `nullableTextField` for why these two need a cast: the backend DTO
    // declares them `nullable` with no explicit `type`, so Orval widens them.
    operatorNotes: nullableTextField<ResolveReturnDto["operatorNotes"]>(
      values.operatorNotes,
    ),
    refundedAmount: nullableTextField<ResolveReturnDto["refundedAmount"]>(
      values.refundedAmount,
    ),
    ...(restock ? { restock: true } : {}),
  };
}
