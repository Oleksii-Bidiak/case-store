"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  getGetUserAdminCardQueryKey,
  getUserControllerFindAllQueryKey,
  getUserControllerFindByIdQueryKey,
  useChangeUserEmail,
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
  Textarea,
} from "@/shared/ui";
import { apiErrorMessage } from "@/shared/lib";
import { dict } from "@/shared/config";
import { buildChangeUserEmailSchema } from "../model/change-user-email-schema";

const d = dict.users;

interface ChangeUserEmailDialogProps {
  userId: string;
  /** The customer's current sign-in address. */
  email: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type FieldErrors = Partial<Record<"newEmail" | "reason", string>>;

/**
 * Change a customer's sign-in address on their behalf (TASK-396) — the
 * customer lost access to their inbox and phoned the shop.
 *
 * Owner-only (`POST /api/users/:id/email` is `@OwnerOnly()`); the card mounts
 * this dialog only for the owner. Two things the copy must make impossible to
 * miss, because an operator would assume the opposite:
 *
 *   - the new address is NOT confirmed by this — the API marks it unverified and
 *     mails it a link, so «Пошта підтверджена» turns off until the customer clicks;
 *   - the reason is REQUIRED and goes into the action journal, together with the
 *     address before and after. It is the only written record of a change made on
 *     somebody's word over the phone.
 */
export function ChangeUserEmailDialog({
  userId,
  email,
  open,
  onOpenChange,
}: ChangeUserEmailDialogProps) {
  const queryClient = useQueryClient();
  const changeEmail = useChangeUserEmail();
  const [newEmail, setNewEmail] = useState("");
  const [reason, setReason] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const close = (next: boolean) => {
    if (!next) {
      setNewEmail("");
      setReason("");
      setFieldErrors({});
      setServerError(null);
    }
    onOpenChange(next);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    const parsed = buildChangeUserEmailSchema(email).safeParse({
      newEmail,
      reason,
    });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof FieldErrors;
        next[field] ??= issue.message;
      }
      setFieldErrors(next);
      return;
    }
    setFieldErrors({});
    setServerError(null);

    changeEmail.mutate(
      { id: userId, data: parsed.data },
      {
        onSuccess: () => {
          // The card shows the address and «Пошта підтверджена»; both changed.
          void queryClient.invalidateQueries({
            queryKey: getGetUserAdminCardQueryKey(userId),
          });
          void queryClient.invalidateQueries({
            queryKey: getUserControllerFindByIdQueryKey(userId),
          });
          void queryClient.invalidateQueries({
            queryKey: getUserControllerFindAllQueryKey(),
          });
          toast.success(d.changeEmailToastDone);
          close(false);
        },
        onError: (mutationError) => {
          // 409 "already registered", 403 — the server's words are the answer.
          const message =
            apiErrorMessage(mutationError) ?? d.changeEmailToastFailed;
          setServerError(message);
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
            <DialogTitle>{d.changeEmailHeading}</DialogTitle>
            <DialogDescription>
              {d.changeEmailDescription(email)}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="change-user-email-new">{d.changeEmailNew}</Label>
            <Input
              id="change-user-email-new"
              type="email"
              autoComplete="off"
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
              aria-invalid={fieldErrors.newEmail ? true : undefined}
              aria-describedby={
                fieldErrors.newEmail ? "change-user-email-new-error" : undefined
              }
            />
            {fieldErrors.newEmail && (
              <p
                id="change-user-email-new-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {fieldErrors.newEmail}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="change-user-email-reason">
              {d.changeEmailReason}
            </Label>
            <Textarea
              id="change-user-email-reason"
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              aria-invalid={fieldErrors.reason ? true : undefined}
              aria-describedby={
                fieldErrors.reason
                  ? "change-user-email-reason-error change-user-email-reason-hint"
                  : "change-user-email-reason-hint"
              }
            />
            <p
              id="change-user-email-reason-hint"
              className="text-xs text-muted-foreground"
            >
              {d.changeEmailReasonHint}
            </p>
            {fieldErrors.reason && (
              <p
                id="change-user-email-reason-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {fieldErrors.reason}
              </p>
            )}
          </div>

          {serverError && (
            <p role="alert" className="text-sm text-destructive">
              {serverError}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => close(false)}
              disabled={changeEmail.isPending}
            >
              {dict.common.cancel}
            </Button>
            <Button type="submit" disabled={changeEmail.isPending}>
              {changeEmail.isPending ? dict.common.saving : d.changeEmailSubmit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
