"use client";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  getListPermissionTemplatesQueryKey,
  useDeletePermissionTemplate,
} from "@/entities/staff";
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

interface DeletePermissionTemplateDialogProps {
  templateId: string;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Delete a permission template.
 *
 * The description says the one thing an owner will otherwise hesitate over:
 * deleting a template takes NOBODY's access away. It could not, even in
 * principle — applying a template copies its keys onto a person and keeps no
 * link, so there is nothing for the deletion to cascade to. Without that
 * sentence a stale template sits in the list forever because removing it feels
 * dangerous.
 */
export function DeletePermissionTemplateDialog({
  templateId,
  name,
  open,
  onOpenChange,
}: DeletePermissionTemplateDialogProps) {
  const queryClient = useQueryClient();
  const deleteTemplate = useDeletePermissionTemplate();

  const handleDelete = () => {
    deleteTemplate.mutate(
      { id: templateId },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getListPermissionTemplatesQueryKey(),
          });
          toast.success(d.templateToastDeleted);
          onOpenChange(false);
        },
        onError: (error) => {
          toast.error(apiErrorMessage(error) ?? d.templateToastDeleteFailed);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{d.templateDeleteHeading}</DialogTitle>
          <DialogDescription>
            {d.templateDeleteDescription(name)}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleteTemplate.isPending}
          >
            {dict.common.cancel}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteTemplate.isPending}
          >
            {deleteTemplate.isPending
              ? dict.common.saving
              : d.templateDeleteConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
