import type { UseFormSetError } from "react-hook-form";
import { dict } from "@/shared/config";
import { apiErrorCode, apiErrorStatus } from "@/shared/lib";
import {
  applyServerFieldErrors,
  type ServerFieldMap,
} from "@/shared/lib/form-errors";
import type { DiscountFormInput } from "./discount-schema";

/** The API's code for "another discount already has this code" (TASK-1984). */
const DISCOUNT_CODE_TAKEN = "DISCOUNT_CODE_TAKEN";

/** `CreateDiscountDto` / `UpdateDiscountDto` paths → form fields (Rule 6b). */
export const DISCOUNT_FIELD_MAP: ServerFieldMap = {
  code: "code",
  value: "value",
  minSpend: "minSpend",
  maxRedemptions: "maxRedemptions",
  perUserLimit: "perUserLimit",
  startsAt: "startsAt",
  expiresAt: "expiresAt",
};

export type DiscountFormSetError = UseFormSetError<DiscountFormInput>;

/**
 * Puts a refused discount save under its field (TASK-1984, Rule 6b) and says
 * whether it did — `false` leaves the toast to the caller. The 400
 * `DISCOUNT_CODE_TAKEN` is the code held by another discount.
 */
export function placeDiscountSaveError(
  error: unknown,
  setError: DiscountFormSetError,
): boolean {
  if (apiErrorStatus(error) !== 400) return false;
  if (apiErrorCode(error) === DISCOUNT_CODE_TAKEN) {
    setError(
      "code",
      { type: "server", message: dict.discountForm.errors.codeTaken },
      { shouldFocus: true },
    );
    return true;
  }
  const { mapped, unmapped } = applyServerFieldErrors<DiscountFormInput>(
    error,
    setError,
    DISCOUNT_FIELD_MAP,
  );
  return mapped.length > 0 && unmapped.length === 0;
}
