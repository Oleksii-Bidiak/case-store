"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "@/shared/ui/toast";
import {
  getGetStaffQueryKey,
  getListStaffQueryKey,
  useDeleteStaff,
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
} from "@/shared/ui";
import { apiErrorMessage } from "@/shared/lib";
import { dict } from "@/shared/config";

const d = dict.staff;

interface DeleteStaffDialogProps {
  userId: string;
  email: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Delete a service account (`DELETE /api/admin/staff/:id`).
 *
 * NOT `DeleteUserDialog`, WHICH LOOKS ALMOST IDENTICAL AND CALLS A DIFFERENT
 * ROUTE. `DELETE /api/users/:id` is owner-only and answers 404 for anything that
 * is not a CUSTOMER — it survived TASK-476's widening untouched, because deleting
 * a shopper erases a person's record and nothing asked for that to be delegated.
 * Pointing this button at it would have answered «не знайдено» for every staff
 * account, which is the failure mode the two dialogs exist to keep apart.
 *
 * Soft delete on both sides: `deletedAt` is stamped, the email is mangled so the
 * address can be registered again, sessions are revoked and the row stays so the
 * audit log still resolves who did what. The copy says so — «видалити» reads as
 * "erase everything" to an operator, and one who believes that avoids the button
 * and leaves a departed employee able to sign in.
 */
export function DeleteStaffDialog({
  userId,
  email,
  open,
  onOpenChange,
}: DeleteStaffDialogProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { userId: actorId } = useAuth();
  const deleteStaff = useDeleteStaff();

  const isSelf = actorId === userId;

  const handleDelete = () => {
    if (isSelf) return;

    deleteStaff.mutate(
      { id: userId },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getListStaffQueryKey(),
          });
          void queryClient.invalidateQueries({
            queryKey: getGetStaffQueryKey(userId),
          });
          toast.success(d.deleteToastDone);
          onOpenChange(false);
          router.replace("/staff");
        },
        onError: (error) => {
          toast.error(apiErrorMessage(error) ?? d.deleteToastFailed);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{d.deleteHeading}</DialogTitle>
          <DialogDescription>
            {isSelf ? dict.users.deleteSelf : d.deleteDescription(email)}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleteStaff.isPending}
          >
            {dict.common.cancel}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={isSelf || deleteStaff.isPending}
          >
            {deleteStaff.isPending ? dict.common.saving : d.deleteConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
