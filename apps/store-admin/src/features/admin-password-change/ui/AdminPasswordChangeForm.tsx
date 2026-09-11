"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAuthControllerChangePassword } from "@/entities/session";
import { Button, Input, Label } from "@/shared/ui";
import { apiErrorMessage, apiErrorStatus } from "@/shared/lib";
import { dict } from "@/shared/config";

const d = dict.profile;

/**
 * Mirrors `IsStaffPassword()` on the API — same rule, stated once here.
 *
 * Staff only, and it stays strict: TASK-407 loosened the SHOPPER policy
 * (`IsCustomerPassword`, no uppercase requirement) and left this one alone.
 */
const STRONG_PASSWORD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

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
 */
export function AdminPasswordChangeForm() {
  const changePassword = useAuthControllerChangePassword();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (currentPassword.length === 0) {
      setError(d.passwordRequired);
      return;
    }
    if (!STRONG_PASSWORD.test(newPassword)) {
      setError(d.passwordWeak);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(d.passwordMismatch);
      return;
    }
    setError(null);

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
          const message =
            apiErrorStatus(mutationError) === 401
              ? d.passwordWrongCurrent
              : (apiErrorMessage(mutationError) ?? d.passwordToastFailed);
          setError(message);
          toast.error(message);
        },
      },
    );
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{d.passwordDescription}</p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-current-password">{d.currentPassword}</Label>
        <Input
          id="profile-current-password"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-new-password">{d.newPassword}</Label>
        <Input
          id="profile-new-password"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-confirm-password">{d.confirmPassword}</Label>
        <Input
          id="profile-confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div>
        <Button type="submit" disabled={changePassword.isPending}>
          {changePassword.isPending ? dict.common.saving : d.passwordSubmit}
        </Button>
      </div>
    </form>
  );
}
