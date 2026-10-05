"use client";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import { Button, useConfirmDialog } from "@/shared/ui";
import { cn } from "@/shared/lib/utils";
import { dict } from "@/shared/config";
import {
  getGetUserAdminCardQueryKey,
  getUserControllerFindAllQueryKey,
  getUserControllerFindByIdQueryKey,
  useUserControllerActivateUser,
  useUserControllerDeactivateUser,
} from "@/entities/user";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";

interface UserBanToggleProps {
  userId: string;
  isActive: boolean;
  /**
   * Who the confirmation names — «Олена Шевченко (olena@example.com)». Falls
   * back to a generic «Клієнт» sentence subject when omitted.
   */
  displayName?: string;
  className?: string;
}

/**
 * Activate/deactivate (ban/unban) control for a single user.
 *
 * Invalidates the admin user list, the user detail query AND the enriched admin
 * card on success, then surfaces a sonner toast. The card key is the one that
 * matters on this screen (SF-AUTH-14 / TASK-406): the only place this button is
 * rendered is `UserDetailView`, which reads `useGetUserAdminCard` — a different
 * query from `findById`. Invalidating the other two left the status line and
 * the button label showing the pre-ban state until a manual reload, so the
 * operator could not tell whether the deactivation had gone through.
 *
 * The action is disabled for the currently authenticated admin to prevent
 * accidental self-ban (UI-only guard — see plan 029 Risks).
 *
 * Not rendered at all without `customers:write` (TASK-716): both endpoints
 * behind it answer 403 to anyone else, and the account status it would change
 * is already stated in words right above it on the card.
 *
 * Wave 198 (UsersProposal К6, TASK-812 canon): switching an account OFF asks
 * first, in an AlertDialog that names the person and says what survives.
 * Switching it back on does not — it is the undo, and it harms nobody.
 */
export function UserBanToggle({
  userId,
  isActive,
  displayName,
  className,
}: UserBanToggleProps) {
  const queryClient = useQueryClient();
  const { userId: currentUserId, can } = useAuth();
  const activate = useUserControllerActivateUser();
  const deactivate = useUserControllerDeactivateUser();
  const { confirm, confirmDialog } = useConfirmDialog();

  const isSelf = currentUserId === userId;
  const isPending = activate.isPending || deactivate.isPending;
  const mutation = isActive ? deactivate : activate;

  if (!can(PERM.customersWrite)) return null;

  const handleToggle = async () => {
    if (isPending) return;
    if (isActive) {
      const confirmed = await confirm({
        title: dict.userBan.confirmTitle,
        description: dict.userBan.confirmDescription(
          displayName ?? dict.users.roleCustomer,
        ),
        confirmLabel: dict.userBan.confirmAction,
        destructive: true,
      });
      if (!confirmed) return;
    }
    mutation.mutate(
      { id: userId },
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
          toast.success(
            isActive
              ? dict.userBan.toastDeactivated
              : dict.userBan.toastActivated,
          );
        },
        onError: () => {
          toast.error(dict.userBan.toastFailed);
        },
      },
    );
  };

  if (isSelf) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled
        title={dict.userBan.cannotSelf}
        aria-label={dict.userBan.cannotSelf}
        className={className}
      >
        {dict.common.deactivate}
      </Button>
    );
  }

  return (
    <>
      <Button
        type="button"
        // К4: «Деактивувати…» is an outline button with destructive text —
        // the red fill belongs to the confirm inside the dialog.
        variant={isActive ? "outline" : "default"}
        size="sm"
        onClick={() => void handleToggle()}
        disabled={isPending}
        aria-label={
          isActive
            ? dict.userBan.deactivateUserAria
            : dict.userBan.activateUserAria
        }
        className={cn(isActive && "text-destructive", className)}
      >
        {isActive ? dict.userBan.deactivateOpen : dict.common.activate}
      </Button>
      {confirmDialog}
    </>
  );
}
