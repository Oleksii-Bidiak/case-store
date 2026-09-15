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
} from "@/entities/user";
import {
  getGetStaffPermissionsQueryKey,
  getGetStaffQueryKey,
  getListStaffQueryKey,
  useUpdateStaffRole,
  type UpdateStaffRoleDtoRole,
} from "@/entities/staff";
import { useAuth } from "@/entities/session";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
} from "@/shared/ui";
import { apiErrorMessage } from "@/shared/lib";
import { dict } from "@/shared/config";

const d = dict.users;

interface UserRoleChangeProps {
  userId: string;
  currentRole: string;
  /** How to name this person in the «призначити адміністратора» confirmation. */
  targetName: string;
  /**
   * Called with the new role after a successful change. The two mount points
   * want different things afterwards — the customer card has to send the
   * operator to `/staff/:id`, because a promoted shopper vanishes from
   * `/api/users` the moment they stop being a CUSTOMER — so the navigation
   * decision belongs to the caller rather than to a `usePathname()` check here.
   */
  onChanged?: (role: string) => void;
  /** Hide the control entirely (a target at or above the caller's level). */
  disabled?: boolean;
}

/**
 * Change a person's role (`PATCH /api/admin/staff/:id/role`).
 *
 * Mounted on BOTH cards, and that is not an accident: promoting an existing
 * shopper is how most managers are hired (so the control has to exist on the
 * customer card), and demoting is how they leave (so it has to exist on the
 * staff card). One component, so the two screens cannot drift into offering
 * different rules for the same endpoint.
 *
 * ## The ADMIN option is only offered to the owner (TASK-480)
 *
 * `assertMayAssign` is strictly-greater — you hand out levels BELOW your own —
 * so a deputy admin picking ADMIN gets a 403 they can do nothing about. It used
 * to be offered to everybody with the server left to explain; now it is absent
 * unless `isOwner`, matching the create wizard.
 *
 * ## …and it goes through a confirmation, which did not exist at all
 *
 * Until now, appointing an administrator was one select and one button: the
 * person silently gained every permission in the catalogue, the audit log, and
 * full control over every manager — with nothing on screen saying so. The dialog
 * lists what is gained and states the part that is easy to miss: only the OWNER
 * can take it back, so a deputy who appoints a second deputy has created somebody
 * they cannot themselves demote.
 *
 * The self-check is mirrored here only so the control is visibly disabled instead
 * of failing on click. The LEVEL checks are deliberately not re-derived: the
 * caller passes `disabled` from the server-supplied levels it already has.
 */
export function UserRoleChange({
  userId,
  currentRole,
  targetName,
  onChanged,
  disabled = false,
}: UserRoleChangeProps) {
  const queryClient = useQueryClient();
  const { userId: actorId, isOwner } = useAuth();
  const updateRole = useUpdateStaffRole();

  // forms.md Rule 1a — seeded from server data, resynchronised during render
  // when the fetched role changes (e.g. after another tab updated it).
  const [syncedRole, setSyncedRole] = useState(currentRole);
  const [role, setRole] = useState(currentRole);
  if (currentRole !== syncedRole) {
    setSyncedRole(currentRole);
    setRole(currentRole);
  }

  const [confirmOpen, setConfirmOpen] = useState(false);

  const isSelf = actorId === userId;
  const isBlocked = isSelf || disabled;

  const commit = (nextRole: string) => {
    updateRole.mutate(
      { id: userId, data: { role: nextRole as UpdateStaffRoleDtoRole } },
      {
        onSuccess: () => {
          // Customer-side keys: the account may be leaving or joining that list.
          void queryClient.invalidateQueries({
            queryKey: getUserControllerFindAllQueryKey(),
          });
          void queryClient.invalidateQueries({
            queryKey: getUserControllerFindByIdQueryKey(userId),
          });
          void queryClient.invalidateQueries({
            queryKey: getGetUserAdminCardQueryKey(userId),
          });
          // Staff-side keys (TASK-480). Without these a promotion left the
          // `/staff` register showing a list the new hire is not in, and a
          // demotion left the staff card rendering somebody who is now a shopper.
          void queryClient.invalidateQueries({
            queryKey: getListStaffQueryKey(),
          });
          void queryClient.invalidateQueries({
            queryKey: getGetStaffQueryKey(userId),
          });
          // The level decides `holdsEverythingByLevel`, so the permissions tab
          // answers differently after this write even though no row moved.
          void queryClient.invalidateQueries({
            queryKey: getGetStaffPermissionsQueryKey(userId),
          });
          setConfirmOpen(false);
          toast.success(d.roleChangeToastDone(roleLabel(nextRole)));
          onChanged?.(nextRole);
        },
        onError: (error) => {
          setConfirmOpen(false);
          toast.error(apiErrorMessage(error) ?? d.roleChangeToastFailed);
        },
      },
    );
  };

  const handleSubmit = () => {
    if (isBlocked || role === currentRole) return;

    if (role === ROLE_VALUES.ADMIN) {
      setConfirmOpen(true);
      return;
    }

    commit(role);
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
        disabled={isBlocked || updateRole.isPending}
      >
        <SelectTrigger id="user-role-select" aria-label={d.roleChangeAria}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ROLE_VALUES.CUSTOMER}>{d.roleCustomer}</SelectItem>
          <SelectItem value={ROLE_VALUES.MANAGER}>{d.roleManager}</SelectItem>
          {/* Absent for a deputy — see the docblock. Kept visible when the
              person ALREADY is an admin, or the select would render a value it
              has no item for and show an empty trigger. */}
          {(isOwner || currentRole === ROLE_VALUES.ADMIN) && (
            <SelectItem value={ROLE_VALUES.ADMIN}>{d.roleAdmin}</SelectItem>
          )}
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
          disabled={isBlocked || role === currentRole || updateRole.isPending}
        >
          {updateRole.isPending ? dict.common.saving : d.roleChangeSubmit}
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dict.staff.promoteHeading}</DialogTitle>
            <DialogDescription>
              {dict.staff.promoteWho(targetName)}
            </DialogDescription>
          </DialogHeader>

          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>{dict.staff.promoteGain1}</li>
            <li>{dict.staff.promoteGain2}</li>
            <li>{dict.staff.promoteGain3}</li>
            <li>{dict.staff.promoteGain4}</li>
          </ul>

          <Separator />

          <p className="text-sm font-medium text-foreground">
            {dict.staff.promoteUndo}
          </p>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={updateRole.isPending}
            >
              {dict.common.cancel}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => commit(ROLE_VALUES.ADMIN)}
              disabled={updateRole.isPending}
            >
              {updateRole.isPending
                ? dict.common.saving
                : dict.staff.promoteConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
