"use client";

import { useState } from "react";
import { toast } from "@/shared/ui/toast";
import { useAuthControllerChangePassword } from "@/entities/session";
import {
  Button,
  FieldError,
  FormAlert,
  Label,
  PasswordInput,
  PasswordRequirements,
} from "@/shared/ui";
import { apiErrorMessage, apiErrorStatus, isStaffPassword } from "@/shared/lib";
import { dict } from "@/shared/config";

const d = dict.profile;

const IDS = {
  current: "profile-current-password",
  next: "profile-new-password",
  confirm: "profile-confirm-password",
} as const;

type FieldName = keyof typeof IDS;

/** The reason under each field, plus a refusal that belongs to the whole form. */
type Errors = Partial<Record<FieldName | "form", string>>;

const errorId = (field: FieldName) => `${IDS[field]}-error`;

/**
 * Change your OWN password from the admin panel (TASK-333 / plan 164 §В1.3).
 *
 * There was no way to do this at all: the storefront's «Змінити пароль» button
 * was a toast mock and the admin panel had no profile screen. It posts to the
 * shared `POST /api/auth/password/change` — one mechanism for storefront and
 * admin, so session revocation and hashing parameters cannot drift between two
 * implementations.
 *
 * A 401 here means the CURRENT password was wrong, not that the session died —
 * saying "не вдалося" would send the operator hunting for a bug that is really
 * a typo.
 *
 * Wave 198 (TASK-1055, Profile П3, form canon 1.5): every field has show/hide;
 * the rule checklist under «Новий пароль» ticks off as it is typed; each
 * problem sits under the field it is about, with `aria-invalid` — the mismatch
 * appears under «Повторіть новий пароль» the moment the two differ, instead of
 * one red line under the button after a submit.
 */
export function AdminPasswordChangeForm() {
  const changePassword = useAuthControllerChangePassword();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});

  // Live: a confirm that has been typed into and differs is already an error —
  // there is nothing to wait for.
  const mismatch =
    confirmPassword.length > 0 && confirmPassword !== newPassword;
  const shown: Errors = {
    ...errors,
    confirm: mismatch ? d.passwordMismatch : errors.confirm,
  };

  const clearError = (field: FieldName) =>
    setErrors((current) => ({
      ...current,
      [field]: undefined,
      form: undefined,
    }));

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    const next: Errors = {};
    if (currentPassword.length === 0) next.current = d.passwordRequired;
    if (!isStaffPassword(newPassword)) next.next = d.passwordWeak;
    else if (newPassword !== confirmPassword) next.confirm = d.passwordMismatch;
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    changePassword.mutate(
      { data: { currentPassword, newPassword } },
      {
        onSuccess: () => {
          setCurrentPassword("");
          setNewPassword("");
          setConfirmPassword("");
          toast.success(d.passwordToastDone);
        },
        onError: (mutationError) => {
          if (apiErrorStatus(mutationError) === 401) {
            setErrors({ current: d.passwordWrongCurrent });
            toast.error(d.passwordWrongCurrent);
            return;
          }
          const message =
            apiErrorMessage(mutationError) ?? d.passwordToastFailed;
          setErrors({ form: message });
          toast.error(message);
        },
      },
    );
  };

  const fieldProps = (field: FieldName) => ({
    id: IDS[field],
    required: true,
    "aria-invalid": shown[field] ? true : undefined,
    "aria-describedby": shown[field] ? errorId(field) : undefined,
  });

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{d.passwordDescription}</p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={IDS.current} required>
          {d.currentPassword}
        </Label>
        <PasswordInput
          {...fieldProps("current")}
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => {
            setCurrentPassword(event.target.value);
            clearError("current");
          }}
        />
        <FieldError id={errorId("current")}>{shown.current}</FieldError>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={IDS.next} required>
          {d.newPassword}
        </Label>
        <PasswordInput
          {...fieldProps("next")}
          autoComplete="new-password"
          value={newPassword}
          onChange={(event) => {
            setNewPassword(event.target.value);
            clearError("next");
          }}
        />
        <FieldError id={errorId("next")}>{shown.next}</FieldError>
        <PasswordRequirements value={newPassword} className="mt-1" />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={IDS.confirm} required>
          {d.confirmPassword}
        </Label>
        <PasswordInput
          {...fieldProps("confirm")}
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => {
            setConfirmPassword(event.target.value);
            clearError("confirm");
          }}
        />
        <FieldError id={errorId("confirm")}>{shown.confirm}</FieldError>
      </div>

      <FormAlert>{shown.form}</FormAlert>

      <div>
        <Button type="submit" disabled={changePassword.isPending}>
          {changePassword.isPending ? dict.common.saving : d.passwordSubmit}
        </Button>
      </div>
    </form>
  );
}
