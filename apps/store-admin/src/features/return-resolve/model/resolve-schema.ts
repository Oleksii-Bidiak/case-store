import { z } from "zod";
import {
  RESTOCK_ON_STATUS,
  ReturnEntityStatus,
  type ResolveReturnDto,
} from "@/entities/return";
import { dict } from "@/shared/config";
import { nullableTextField } from "@/shared/lib";

const t = dict.returns;

/** Same ceiling as `ResolveReturnDto.operatorNotes` (`@MaxLength(2000)`). */
export const OPERATOR_NOTES_MAX_LENGTH = 2000;

/**
 * The one status step the PATCH still owns (TASK-2044, R2 TASK-2046):
 * APPROVED and REJECTED are decisions (`features/return-decide`), and REFUNDED
 * follows from the payouts on the order ledger — the API refuses it here with
 * RETURN_REFUND_DERIVED. No amount rides on this form any more: what goes back
 * is «До повернення» and its payouts, on the return's money card.
 */
const PATCH_STATUSES: readonly string[] = [ReturnEntityStatus.RECEIVED];

/** The operator's step on a return (TASK-340): the status, the notes, restock. */
export const resolveReturnSchema = z.object({
  // A string, not an enum, so the form can hold "" until a step button sets it.
  status: z.string().refine((status) => PATCH_STATUSES.includes(status)),
  operatorNotes: z
    .string()
    .trim()
    .max(OPERATOR_NOTES_MAX_LENGTH, t.operatorNotesTooLong),
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
 * `restock` is sent only when it is true AND applicable — the flag means
 * "credit the stock now", and a request carrying it where it cannot apply reads
 * like an intent the operator never had.
 */
export function resolveValuesToDto(
  values: ResolveReturnFormValues,
  alreadyRestockedAt: string | null,
): ResolveReturnDto {
  const restock =
    values.restock && canRestock(values.status, alreadyRestockedAt);

  return {
    status: values.status as ResolveReturnDto["status"],
    // See `nullableTextField` for why this needs a cast: the backend DTO
    // declares it `nullable` with no explicit `type`, so Orval widens it.
    operatorNotes: nullableTextField<ResolveReturnDto["operatorNotes"]>(
      values.operatorNotes,
    ),
    ...(restock ? { restock: true } : {}),
  };
}

/**
 * The notes-only PATCH body: no status, so no transition — the API saves the
 * notes on a return of any status. Nothing else may ride along: the API refuses
 * a restock without a status (RETURN_STATUS_REQUIRED).
 */
export function notesOnlyDto(operatorNotes: string): ResolveReturnDto {
  return {
    operatorNotes:
      nullableTextField<ResolveReturnDto["operatorNotes"]>(operatorNotes),
  };
}
