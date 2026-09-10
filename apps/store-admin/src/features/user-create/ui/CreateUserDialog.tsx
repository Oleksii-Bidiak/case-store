"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CreateUserDtoRole,
  getUserControllerFindAllQueryKey,
  useCreateUser,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui";
import { apiErrorMessage, apiErrorStatus } from "@/shared/lib";
import { dict } from "@/shared/config";

const d = dict.users;

/**
 * Mirrors `IsStaffPassword()` on the API — same rule, stated once here.
 *
 * Staff only, and it stays strict: TASK-407 loosened the SHOPPER policy
 * (`IsCustomerPassword`, no uppercase requirement) and left this one alone.
 */
const STRONG_PASSWORD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Create a staff account from the admin panel (TASK-317, plan 164 §В1.1).
 *
 * Until this existed the only way to hire someone was `scripts/create-admin.ts`
 * on the production server — a personnel decision that required a developer,
 * every time. The role select offers ADMIN and MANAGER only; shoppers register
 * themselves on the storefront and the API rejects `CUSTOMER` here outright.
 *
 * The password is typed by the owner and handed over out-of-band. There is no
 * invitation email yet, so the copy tells the operator to pass it on personally
 * and points them at the employee's own profile page for changing it.
 */
export function CreateUserDialog({
  open,
  onOpenChange,
}: CreateUserDialogProps) {
  const queryClient = useQueryClient();
  const createUser = useCreateUser();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<string>(CreateUserDtoRole.MANAGER);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setEmail("");
    setPassword("");
    setFirstName("");
    setLastName("");
    setRole(CreateUserDtoRole.MANAGER);
    setError(null);
  };

  const close = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!EMAIL.test(email.trim())) {
      setError(d.createEmailInvalid);
      return;
    }
    if (!STRONG_PASSWORD.test(password)) {
      setError(d.createPasswordWeak);
      return;
    }
    setError(null);

    createUser.mutate(
      {
        data: {
          email: email.trim(),
          password,
          role: role as (typeof CreateUserDtoRole)[keyof typeof CreateUserDtoRole],
          firstName: firstName.trim() || undefined,
          lastName: lastName.trim() || undefined,
        },
      },
      {
        onSuccess: (res) => {
          void queryClient.invalidateQueries({
            queryKey: getUserControllerFindAllQueryKey(),
          });
          toast.success(d.createToastDone(res.data.email));
          close(false);
        },
        onError: (mutationError) => {
          // 409 is the one failure the operator can actually act on.
          const message =
            apiErrorStatus(mutationError) === 409
              ? d.createEmailTaken
              : (apiErrorMessage(mutationError) ?? d.createToastFailed);
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
            <DialogTitle>{d.createHeading}</DialogTitle>
            <DialogDescription>{d.createDescription}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="create-user-email">{d.createEmail}</Label>
            <Input
              id="create-user-email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="create-user-password">{d.createPassword}</Label>
            <Input
              id="create-user-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-describedby="create-user-password-hint"
            />
            <p
              id="create-user-password-hint"
              className="text-xs text-muted-foreground"
            >
              {d.createPasswordHint}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="create-user-first-name">
                {d.createFirstName}
              </Label>
              <Input
                id="create-user-first-name"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="create-user-last-name">{d.createLastName}</Label>
              <Input
                id="create-user-last-name"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="create-user-role">{d.createRole}</Label>
            <Select
              value={role}
              onValueChange={(value) => {
                if (value === "") return; // Radix bubble-input bounce (TASK-201)
                setRole(value);
              }}
            >
              <SelectTrigger id="create-user-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={CreateUserDtoRole.MANAGER}>
                  {d.roleManager}
                </SelectItem>
                <SelectItem value={CreateUserDtoRole.ADMIN}>
                  {d.roleAdmin}
                </SelectItem>
              </SelectContent>
            </Select>
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
              disabled={createUser.isPending}
            >
              {dict.common.cancel}
            </Button>
            <Button type="submit" disabled={createUser.isPending}>
              {createUser.isPending ? dict.common.saving : d.createSubmit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
