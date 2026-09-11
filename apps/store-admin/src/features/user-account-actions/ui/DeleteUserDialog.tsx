"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  getGetUserAdminCardQueryKey,
  getUserControllerFindAllQueryKey,
  getUserControllerFindByIdQueryKey,
  useDeleteUser,
} from "@/entities/user";
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

const d = dict.users;

interface DeleteUserDialogProps {
  userId: string;
  email: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Delete a user account (TASK-317).
 *
 * `useDeleteUser` has been generated since the users module shipped and was
 * wired to nothing — the admin panel had no delete affordance at all. The API
 * performs a soft delete (`deletedAt` tombstone, per the project's
 * isActive-vs-deletedAt convention), so orders and history survive; the copy
 * says so, because "видалити" reads as "erase everything" to an operator and
 * they would otherwise avoid the button out of fear.
 *
 * The last-active-administrator guard lives on the server. Its message is
 * surfaced verbatim.
 */
export function DeleteUserDialog({
  userId,
  email,
  open,
  onOpenChange,
}: DeleteUserDialogProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { userId: actorId } = useAuth();
  const deleteUser = useDeleteUser();

  const isSelf = actorId === userId;

  const handleDelete = () => {
    if (isSelf) return;

    deleteUser.mutate(
      { id: userId },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getUserControllerFindAllQueryKey(),
          });
          // TASK-406: the list was the only key invalidated, so the tombstoned
          // account's own cached queries survived the delete. Navigating back
          // into `/users/<id>` within the panel's five-minute `staleTime` then
          // re-rendered the deleted user from cache as if nothing had happened.
          void queryClient.invalidateQueries({
            queryKey: getUserControllerFindByIdQueryKey(userId),
          });
          void queryClient.invalidateQueries({
            queryKey: getGetUserAdminCardQueryKey(userId),
          });
          toast.success(d.deleteToastDone);
          onOpenChange(false);
          router.replace("/users");
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
            {isSelf ? d.deleteSelf : d.deleteDescription(email)}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleteUser.isPending}
          >
            {dict.common.cancel}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={isSelf || deleteUser.isPending}
          >
            {deleteUser.isPending ? dict.common.saving : d.deleteConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
