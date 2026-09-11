"use client";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/shared/ui";
import { dict } from "@/shared/config";
import {
  getGetUserAdminCardQueryKey,
  getUserControllerFindAllQueryKey,
  getUserControllerFindByIdQueryKey,
  useUserControllerActivateUser,
  useUserControllerDeactivateUser,
} from "@/entities/user";
import { useAuth } from "@/entities/session";

interface UserBanToggleProps {
  userId: string;
  isActive: boolean;
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
 */
export function UserBanToggle({ userId, isActive }: UserBanToggleProps) {
  const queryClient = useQueryClient();
  const { userId: currentUserId } = useAuth();
  const activate = useUserControllerActivateUser();
  const deactivate = useUserControllerDeactivateUser();

  const isSelf = currentUserId === userId;
  const isPending = activate.isPending || deactivate.isPending;
  const mutation = isActive ? deactivate : activate;

  const handleToggle = () => {
    if (isPending) return;
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
      >
        {dict.common.deactivate}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant={isActive ? "destructive" : "default"}
      size="sm"
      onClick={handleToggle}
      disabled={isPending}
      aria-label={
        isActive
          ? dict.userBan.deactivateUserAria
          : dict.userBan.activateUserAria
      }
    >
      {isActive ? dict.common.deactivate : dict.common.activate}
    </Button>
  );
}
