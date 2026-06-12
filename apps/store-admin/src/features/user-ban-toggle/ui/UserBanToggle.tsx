"use client";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/shared/ui";
import {
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
 * Invalidates both the admin user list and the specific user detail query on
 * success, and surfaces a sonner toast. The action is disabled for the
 * currently authenticated admin to prevent accidental self-ban (UI-only guard —
 * see plan 029 Risks).
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
          toast.success(isActive ? "User deactivated." : "User activated.");
        },
        onError: () => {
          toast.error("Failed to update user status.");
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
        title="Cannot deactivate your own account."
        aria-label="Cannot deactivate your own account"
      >
        Deactivate
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
      aria-label={isActive ? "Deactivate user" : "Activate user"}
    >
      {isActive ? "Deactivate" : "Activate"}
    </Button>
  );
}
