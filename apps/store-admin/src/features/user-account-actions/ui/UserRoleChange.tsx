"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ROLE_VALUES,
  getGetUserAdminCardQueryKey,
  getUserControllerFindAllQueryKey,
  getUserControllerFindByIdQueryKey,
  roleLabel,
  useUpdateUserRole,
  type UpdateUserRoleDtoRole,
} from "@/entities/user";
import { useAuth } from "@/entities/session";
import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui";
import { apiErrorMessage } from "@/shared/lib";
import { dict } from "@/shared/config";

const d = dict.users;

interface UserRoleChangeProps {
  userId: string;
  currentRole: string;
}

/**
 * Change a user's role (TASK-317, owner-only on the API).
 *
 * Two refusals come back from the server and both are worth showing verbatim
 * rather than as "не вдалося": changing your OWN role (the fastest way to lock
 * yourself out, and never intentional) and demoting the LAST active
 * administrator (which would leave the shop with no way back in short of shell
 * access to the production database). The self-check is mirrored here only so
 * the control is visibly disabled instead of failing on click.
 */
export function UserRoleChange({ userId, currentRole }: UserRoleChangeProps) {
  const queryClient = useQueryClient();
  const { userId: actorId } = useAuth();
  const updateRole = useUpdateUserRole();

  // forms.md Rule 1a — seeded from server data, resynchronised during render
  // when the fetched role changes (e.g. after another tab updated it).
  const [syncedRole, setSyncedRole] = useState(currentRole);
  const [role, setRole] = useState(currentRole);
  if (currentRole !== syncedRole) {
    setSyncedRole(currentRole);
    setRole(currentRole);
  }

  const isSelf = actorId === userId;

  const handleSubmit = () => {
    if (isSelf || role === currentRole) return;

    updateRole.mutate(
      { id: userId, data: { role: role as UpdateUserRoleDtoRole } },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getUserControllerFindAllQueryKey(),
          });
          void queryClient.invalidateQueries({
            queryKey: getUserControllerFindByIdQueryKey(userId),
          });
          void queryClient.invalidateQueries({
            queryKey: getGetUserAdminCardQueryKey(userId),
          });
          toast.success(d.roleChangeToastDone(roleLabel(role)));
        },
        onError: (error) => {
          toast.error(apiErrorMessage(error) ?? d.roleChangeToastFailed);
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="user-role-select">{d.roleChangeLabel}</Label>
      <Select
        value={role}
        onValueChange={(value) => {
          if (value === "") return; // Radix bubble-input bounce (TASK-201)
          setRole(value);
        }}
        disabled={isSelf || updateRole.isPending}
      >
        <SelectTrigger id="user-role-select" aria-label={d.roleChangeAria}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ROLE_VALUES.CUSTOMER}>{d.roleCustomer}</SelectItem>
          <SelectItem value={ROLE_VALUES.MANAGER}>{d.roleManager}</SelectItem>
          <SelectItem value={ROLE_VALUES.ADMIN}>{d.roleAdmin}</SelectItem>
        </SelectContent>
      </Select>

      <p className="text-xs text-muted-foreground">
        {isSelf ? d.roleChangeSelf : d.roleChangeHint}
      </p>

      <div>
        <Button
          type="button"
          size="sm"
          onClick={handleSubmit}
          disabled={isSelf || role === currentRole || updateRole.isPending}
        >
          {updateRole.isPending ? dict.common.saving : d.roleChangeSubmit}
        </Button>
      </div>
    </div>
  );
}
