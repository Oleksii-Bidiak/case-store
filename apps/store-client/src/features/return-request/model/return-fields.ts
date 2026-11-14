import { dict } from "@/shared/config";
import {
  mapServerFieldErrors,
  readFieldErrors,
  type ServerFieldMap,
} from "@/shared/lib/form-errors";

/**
 * `CreateReturnDto.reason` — `@MaxLength(1000)`
 * (`apps/store-api/src/order/returns/dto/create-return.dto.ts`). The textarea
 * caps at it, the counter shows it, and the submit checks it (forms Rule 5d).
 */
export const RETURN_REASON_MAX = 1000;

/** The dialog's fields that can carry an error. */
export type ReturnField = "reason" | "items" | "outcome";

export type ReturnFieldErrors = Partial<Record<ReturnField, string>>;

/**
 * `CreateReturnDto` path → dialog field (TASK-1984, forms Rule 6b). Every line
 * error (`items.0.quantity`, `items.0.orderItemId`) and the array itself land on
 * the one line list — the customer fixes them there, not per DTO path.
 */
export const RETURN_FIELD_MAP: ServerFieldMap = {
  reason: "reason",
  items: "items",
  "items.*": "items",
  requestedOutcome: "outcome",
};

function isMapped(field: string): boolean {
  return field in RETURN_FIELD_MAP || field.startsWith("items.");
}

/**
 * Place a `CreateReturnDto` 400 on the dialog's fields. `complete` is true only
 * when every reported error found a field — otherwise the caller still owes a
 * toast for the rest (Rule 6c), and never one in addition to a fully placed 400.
 */
export function placeReturnFieldErrors(error: unknown): {
  errors: ReturnFieldErrors;
  complete: boolean;
} {
  const entries = readFieldErrors(error);
  const reasonConstraint = entries.find(
    (entry) => entry.field === "reason",
  )?.constraint;
  const errors = mapServerFieldErrors(error, RETURN_FIELD_MAP, {
    reason:
      reasonConstraint === "maxLength"
        ? dict.returnRequest.reasonMax
        : dict.forms.invalid,
    items: dict.returnRequest.itemsInvalid,
    outcome: dict.forms.invalid,
  }) as ReturnFieldErrors;
  const complete =
    entries.length > 0 && entries.every((entry) => isMapped(entry.field));
  return { errors, complete };
}
