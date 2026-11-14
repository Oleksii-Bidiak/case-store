"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  getGetStaffQueryKey,
  getListStaffQueryKey,
  useTransferStaffOwnership,
} from "@/entities/staff";
import { getGetMyPermissionsQueryKey } from "@/entities/session";
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
  Separator,
} from "@/shared/ui";
import { apiErrorMessage, apiErrorStatus } from "@/shared/lib";
import { mapServerFieldErrors } from "@/shared/lib/form-errors";
import { dict } from "@/shared/config";

const d = dict.staff;

interface TransferOwnershipDialogProps {
  /** The administrator receiving the shop. */
  userId: string;
  targetName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Hand the shop to another administrator
 * (`POST /api/admin/staff/:id/transfer-ownership`).
 *
 * THE PASSWORD FIELD IS THE CALLER'S OWN, not the recipient's. A valid token
 * proves a session was opened in the last quarter of an hour; it does not prove
 * the owner is at the keyboard now. This is the one act in the panel that cannot
 * be undone by signing back in — afterwards the caller is an ordinary deputy and
 * the recipient holds the reserve — so it re-authenticates.
 *
 * ONE 401 HERE DOES NOT MEAN «ваша сесія закінчилась». The route lives outside
 * `/auth/`, so the shared axios interceptor refreshes once and replays the
 * request before the error reaches this handler; a wrong password therefore
 * arrives as a plain 401 having written nothing (asserted in `staff.e2e-spec.ts`).
 * Treating it as an expired session — the interceptor's usual reading — would
 * sign the owner out for a typo, so the 401 is named explicitly.
 *
 * Both parties' sessions are revoked server-side, which includes the caller's:
 * the dialog says so before the click rather than letting the panel appear to
 * break afterwards.
 */
export function TransferOwnershipDialog({
  userId,
  targetName,
  open,
  onOpenChange,
}: TransferOwnershipDialogProps) {
  const queryClient = useQueryClient();
  const transfer = useTransferStaffOwnership();
  const [password, setPassword] = useState("");
  // TASK-1984 (Rule 6a/6c): a refusal of the password sits under the field;
  // `error` is the one about the act itself (not an admin any more, 5xx…).
  // Each is shown once — no toast repeating it.
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = (next: boolean) => {
    if (!next) {
      setPassword("");
      setPasswordError(null);
      setError(null);
    }
    onOpenChange(next);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    setError(null);
    // `TransferOwnershipDto.password` is `@IsNotEmpty` — presence only.
    if (password.length === 0) {
      setPasswordError(d.transferPasswordRequired);
      return;
    }
    setPasswordError(null);

    transfer.mutate(
      { id: userId, data: { password } },
      {
        onSuccess: (result) => {
          void queryClient.invalidateQueries({
            queryKey: getListStaffQueryKey(),
          });
          void queryClient.invalidateQueries({
            queryKey: getGetStaffQueryKey(userId),
          });
          // The caller is a deputy from this moment on — their own effective
          // permissions changed, and the owner's reserve must stop rendering.
          void queryClient.invalidateQueries({
            queryKey: getGetMyPermissionsQueryKey(),
          });
          toast.success(d.transferToastDone(result.data.owner.email));
          close(false);
        },
        onError: (mutationError) => {
          const status = apiErrorStatus(mutationError);
          if (status === 401) {
            setPasswordError(d.transferWrongPassword);
            return;
          }
          if (status === 400) {
            const fields = mapServerFieldErrors(
              mutationError,
              { password: "password" },
              { password: d.transferPasswordRequired },
            );
            if (fields.password) {
              setPasswordError(fields.password);
              return;
            }
          }
          setError(apiErrorMessage(mutationError) ?? d.transferToastFailed);
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
            <DialogTitle>{d.transferHeading}</DialogTitle>
            <DialogDescription>{d.transferIntro}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {d.transferTargetLabel}
            </span>
            <span className="text-sm font-medium text-foreground">
              {targetName}
            </span>
          </div>

          <Separator />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="transfer-ownership-password">
              {d.transferPasswordLabel}
            </Label>
            <Input
              id="transfer-ownership-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                if (passwordError) setPasswordError(null);
              }}
              aria-invalid={passwordError ? true : undefined}
              aria-describedby={
                passwordError
                  ? "transfer-ownership-password-error transfer-ownership-password-hint"
                  : "transfer-ownership-password-hint"
              }
            />
            <FieldError id="transfer-ownership-password-error">
              {passwordError}
            </FieldError>
            <p
              id="transfer-ownership-password-hint"
              className="text-xs text-muted-foreground"
            >
              {d.transferPasswordHint}
            </p>
          </div>

          <p className="text-xs text-muted-foreground">
            {d.transferSessionsHint}
          </p>

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
              disabled={transfer.isPending}
            >
              {dict.common.cancel}
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={transfer.isPending}
            >
              {transfer.isPending ? dict.common.saving : d.transferSubmit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
