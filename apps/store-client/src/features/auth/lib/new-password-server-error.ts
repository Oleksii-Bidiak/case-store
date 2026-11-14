import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { dict } from "@/shared/config";
import { apiErrorStatus } from "@/shared/lib/api-error";
import {
  applyServerFieldErrors,
  readFieldErrors,
  type ServerFieldMap,
} from "@/shared/lib/form-errors";

/**
 * A 400 about the NEW password goes under the new-password field (TASK-1984,
 * forms convention Rule 6b) — for `POST /auth/password/change` and
 * `POST /auth/password/reset/confirm`.
 *
 * Those endpoints answer 400 in exactly two ways:
 *   - the DTO refused a field — `fieldErrors` says which (`newPassword`,
 *     `currentPassword`), and each lands under its own field;
 *   - `AuthService.assertPasswordMeetsRolePolicy` refused the password of a
 *     STAFF account (the DTO only knows the shopper policy, TASK-407) — that
 *     400 has no `fieldErrors`, and it is about the new password only.
 *
 * Returns `true` when the error was placed on a field, so the form shows no
 * banner for it; anything else (401, 429, 5xx, an unmapped entry) is the
 * form's to show.
 */
export function applyNewPasswordServerError<TFieldValues extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<TFieldValues>,
  fields: {
    newPassword: Path<TFieldValues>;
    currentPassword?: Path<TFieldValues>;
  },
): boolean {
  if (apiErrorStatus(error) !== 400) return false;

  const entries = readFieldErrors(error);
  if (entries.length === 0) {
    setError(fields.newPassword, {
      type: "server",
      message: dict.auth.register.validationPasswordPolicyStaff,
    });
    return true;
  }

  const fieldMap: ServerFieldMap = { newPassword: fields.newPassword };
  if (fields.currentPassword) {
    fieldMap.currentPassword = fields.currentPassword;
  }
  const constraint = entries.find(
    (entry) => entry.field === "newPassword",
  )?.constraint;
  const { unmapped } = applyServerFieldErrors(error, setError, fieldMap, {
    [fields.newPassword]:
      constraint === "minLength"
        ? dict.auth.register.validationPassword
        : dict.auth.register.validationPasswordPolicy,
    ...(fields.currentPassword
      ? {
          [fields.currentPassword]:
            dict.auth.changePassword.validationCurrentRequired,
        }
      : {}),
  });
  return unmapped.length === 0;
}
