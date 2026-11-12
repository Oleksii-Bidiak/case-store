"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  getGetStaffQueryKey,
  getListStaffQueryKey,
  useSetStaffPassword,
} from "@/entities/staff";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FieldError,
  Input,
  Label,
} from "@/shared/ui";
import { apiErrorMessage, apiErrorStatus, isStaffPassword } from "@/shared/lib";
import { mapServerFieldErrors } from "@/shared/lib/form-errors";
import { dict } from "@/shared/config";

const d = dict.users;

interface UserPasswordResetDialogProps {
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Reset someone else's password (TASK-333; `POST /api/admin/staff/:id/password`
 * since TASK-476, so a deputy admin can rescue a manager without the owner).
 *
 * The API routes this through the same `AuthService.setPassword` as a
 * self-service reset, so it revokes the target's sessions AND clears the
 * failed-login lockout. That second effect is the practical answer to "my
 * employee cannot get in and I cannot see why" while the lockout fields remain
 * unexposed — hence the wording in the dialog description.
 */
export function UserPasswordResetDialog({
  userId,
  open,
  onOpenChange,
}: UserPasswordResetDialogProps) {
  const queryClient = useQueryClient();
  const setPassword = useSetStaffPassword();
  const [newPassword, setNewPassword] = useState("");
  // TASK-1984 (Rule 6a/6c): a refusal of the password sits under the input;
  // `error` is one with no field (permission, 5xx…). Each is shown once — no
  // toast repeating it.
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = (next: boolean) => {
    if (!next) {
      setNewPassword("");
      setPasswordError(null);
      setError(null);
    }
    onOpenChange(next);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    setError(null);
    if (!isStaffPassword(newPassword)) {
      setPasswordError(d.passwordWeak);
      return;
    }
    setPasswordError(null);

    setPassword.mutate(
      { id: userId, data: { newPassword } },
      {
        onSuccess: () => {
          // TASK-406: this dialog invalidated nothing at all. The write bumps
          // the row's `updatedAt`, which the card renders as «Останнє
          // оновлення», so the screen kept showing a timestamp from before the
          // reset — the one visible confirmation the operator has.
          //
          // TASK-480 repointed the keys at the staff register: the customer keys
          // this used to invalidate can no longer contain the target at all, so
          // it was refetching one list the person is not in and leaving the one
          // they ARE in stale.
          void queryClient.invalidateQueries({
            queryKey: getGetStaffQueryKey(userId),
          });
          void queryClient.invalidateQueries({
            queryKey: getListStaffQueryKey(),
          });
          toast.success(d.passwordResetToastDone);
          close(false);
        },
        onError: (mutationError) => {
          if (apiErrorStatus(mutationError) === 400) {
            // `SetStaffPasswordDto.newPassword` is `@IsStaffPassword` — the
            // rule `isStaffPassword` already checked, in the client's words.
            const fields = mapServerFieldErrors(
              mutationError,
              { newPassword: "newPassword" },
              { newPassword: d.passwordWeak },
            );
            if (fields.newPassword) {
              setPasswordError(fields.newPassword);
              return;
            }
          }
          setError(
            apiErrorMessage(mutationError) ?? d.passwordResetToastFailed,
          );
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle>{d.passwordResetHeading}</DialogTitle>
            <DialogDescription>{d.passwordResetDescription}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reset-password-new">{d.passwordResetNew}</Label>
            <Input
              id="reset-password-new"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => {
                setNewPassword(event.target.value);
                if (passwordError) setPasswordError(null);
              }}
              aria-invalid={passwordError ? true : undefined}
              aria-describedby={
                passwordError
                  ? "reset-password-new-error reset-password-new-hint"
                  : "reset-password-new-hint"
              }
            />
            <FieldError id="reset-password-new-error">
              {passwordError}
            </FieldError>
            <p
              id="reset-password-new-hint"
              className="text-xs text-muted-foreground"
            >
              {d.passwordHint}
            </p>
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => close(false)}
              disabled={setPassword.isPending}
            >
              {dict.common.cancel}
            </Button>
            <Button type="submit" disabled={setPassword.isPending}>
              {setPassword.isPending
                ? dict.common.saving
                : d.passwordResetSubmit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
