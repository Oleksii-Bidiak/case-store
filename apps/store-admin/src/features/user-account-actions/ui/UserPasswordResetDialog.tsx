"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getGetUserAdminCardQueryKey,
  getUserControllerFindByIdQueryKey,
  useSetUserPassword,
} from "@/entities/user";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@/shared/ui";
import { apiErrorMessage } from "@/shared/lib";
import { dict } from "@/shared/config";

const d = dict.users;

/** Mirrors `IsStrongAppPassword()` on the API — same rule, stated once here. */
const STRONG_PASSWORD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

interface UserPasswordResetDialogProps {
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Reset someone else's password (TASK-333, owner-only).
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
  const setPassword = useSetUserPassword();
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const close = (next: boolean) => {
    if (!next) {
      setNewPassword("");
      setError(null);
    }
    onOpenChange(next);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!STRONG_PASSWORD.test(newPassword)) {
      setError(d.createPasswordWeak);
      return;
    }
    setError(null);

    setPassword.mutate(
      { id: userId, data: { newPassword } },
      {
        onSuccess: () => {
          // TASK-406: this dialog invalidated nothing at all. The write bumps
          // the user row's `updatedAt`, which the card renders as «Останнє
          // оновлення», so the screen kept showing a timestamp from before the
          // reset — the one visible confirmation the operator has.
          void queryClient.invalidateQueries({
            queryKey: getUserControllerFindByIdQueryKey(userId),
          });
          void queryClient.invalidateQueries({
            queryKey: getGetUserAdminCardQueryKey(userId),
          });
          toast.success(d.passwordResetToastDone);
          close(false);
        },
        onError: (mutationError) => {
          const message =
            apiErrorMessage(mutationError) ?? d.passwordResetToastFailed;
          setError(message);
          toast.error(message);
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
              onChange={(event) => setNewPassword(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {d.createPasswordHint}
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
