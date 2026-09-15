"use client";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  getGetStaffQueryKey,
  getListStaffQueryKey,
  useUpdateStaffStatus,
} from "@/entities/staff";
import { Button } from "@/shared/ui";
import { apiErrorMessage } from "@/shared/lib";
import { dict } from "@/shared/config";

const d = dict.staff;

interface StaffStatusToggleProps {
  userId: string;
  isActive: boolean;
  disabled?: boolean;
}

/**
 * Switch a service account's panel access on or off
 * (`PATCH /api/admin/staff/:id/status`).
 *
 * A SEPARATE CONTROL FROM `UserBanToggle`, WHICH IS THE POINT OF THE ROUTE.
 * Deactivating any account used to be `customers:write` (`user.controller.ts`),
 * so an operator hired to phone customers could switch off an administrator.
 * This one is `staff:write` plus the level rule — and the API deliberately serves
 * both directions from one route so the check cannot be present on activate and
 * missing on deactivate, which is how the hole opened in the first place.
 *
 * Deactivation is the reversible half of the isActive/deletedAt convention: the
 * person stops being able to sign in, everything they did stays attributed, and
 * the owner can turn them back on when they return from leave.
 */
export function StaffStatusToggle({
  userId,
  isActive,
  disabled = false,
}: StaffStatusToggleProps) {
  const queryClient = useQueryClient();
  const updateStatus = useUpdateStaffStatus();

  const handleToggle = () => {
    updateStatus.mutate(
      { id: userId, data: { isActive: !isActive } },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getGetStaffQueryKey(userId),
          });
          void queryClient.invalidateQueries({
            queryKey: getListStaffQueryKey(),
          });
          toast.success(
            isActive ? d.statusToastDeactivated : d.statusToastActivated,
          );
        },
        onError: (error) => {
          toast.error(apiErrorMessage(error) ?? d.statusToastFailed);
        },
      },
    );
  };

  return (
    <Button
      type="button"
      size="sm"
      variant={isActive ? "outline" : "default"}
      onClick={handleToggle}
      disabled={disabled || updateStatus.isPending}
    >
      {updateStatus.isPending
        ? dict.common.saving
        : isActive
          ? d.statusDeactivate
          : d.statusActivate}
    </Button>
  );
}
