"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  ROLE_VALUES,
  getGetUserAdminCardQueryKey,
  getUserControllerFindAllQueryKey,
  getUserControllerFindByIdQueryKey,
  roleLabel,
  useUpdateStaffRole,
  type UpdateStaffRoleDtoRole,
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
 * Change a user's role (TASK-317; `PATCH /api/admin/staff/:id/role` since
 * TASK-476).
 *
 * The refusals that come back are worth showing verbatim rather than as «не
 * вдалося», and there are three kinds now: changing your OWN role (the fastest
 * way to lock yourself out, and never intentional), acting on somebody at or
 * above your own level, and handing out a level at or above your own. The
 * last-active-administrator refusal is gone — the level rule replaced it with the
 * stronger invariant that the owner cannot be demoted at all.
 *
 * The self-check is mirrored here only so the control is visibly disabled instead
 * of failing on click. The level checks are deliberately NOT mirrored: the level
 * of the person on screen is server truth, and a second copy of the rule in the
 * browser is the copy that goes stale. TASK-480 gives this control the level badge
 * that makes the server's answer predictable before the click.
 */
export function UserRoleChange({ userId, currentRole }: UserRoleChangeProps) {
  const queryClient = useQueryClient();
  const { userId: actorId } = useAuth();
  const updateRole = useUpdateStaffRole();

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
      { id: userId, data: { role: role as UpdateStaffRoleDtoRole } },
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
