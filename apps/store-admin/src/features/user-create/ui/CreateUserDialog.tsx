"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  CreateStaffDtoRole,
  getListStaffQueryKey,
  useCreateStaff,
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
import { apiErrorMessage, apiErrorStatus, isStaffPassword } from "@/shared/lib";
import { dict } from "@/shared/config";

const d = dict.users;

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
 * Posts to `POST /api/admin/staff` since TASK-476. ADMIN is still offered in the
 * select and is still refused by the API for a deputy admin — only the owner
 * appoints administrators. TASK-480 builds the `/staff` section that hides the
 * option a deputy cannot use; until then a 403 explains it, which is the same
 * thing the owner-only button did before.
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
  const createStaff = useCreateStaff();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<string>(CreateStaffDtoRole.MANAGER);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setEmail("");
    setPassword("");
    setFirstName("");
    setLastName("");
    setRole(CreateStaffDtoRole.MANAGER);
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
    if (!isStaffPassword(password)) {
      setError(d.createPasswordWeak);
      return;
    }
    setError(null);

    createStaff.mutate(
      {
        data: {
          email: email.trim(),
          password,
          role: role as (typeof CreateStaffDtoRole)[keyof typeof CreateStaffDtoRole],
          firstName: firstName.trim() || undefined,
          lastName: lastName.trim() || undefined,
        },
      },
      {
        onSuccess: (res) => {
          // The STAFF list, not the customer list (TASK-476). A new service
          // account never appears in `/api/users` any more, so invalidating that
          // query would refetch a list the account is not in and leave the one it
          // IS in stale.
          void queryClient.invalidateQueries({
            queryKey: getListStaffQueryKey(),
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
                <SelectItem value={CreateStaffDtoRole.MANAGER}>
                  {d.roleManager}
                </SelectItem>
                <SelectItem value={CreateStaffDtoRole.ADMIN}>
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
              disabled={createStaff.isPending}
            >
              {dict.common.cancel}
            </Button>
            <Button type="submit" disabled={createStaff.isPending}>
              {createStaff.isPending ? dict.common.saving : d.createSubmit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
