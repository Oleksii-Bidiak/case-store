"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  getProductControllerAdminFindAllQueryKey,
  getProductControllerFindByIdQueryKey,
  useDeleteProduct,
} from "@/entities/product";
import { useAuth } from "@/entities/session";
import { PERM } from "@/entities/permission";
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

const d = dict.products;

interface ProductDeleteActionProps {
  productId: string;
  /** Product name — shown in the confirm copy and in the success toast. */
  name: string;
  /**
   * Ran after the server confirms the delete and the caches are invalidated.
   * The list stays put (the row simply disappears on refetch); the edit page and
   * the read-only card navigate away, because the product they were showing no
   * longer resolves through any read.
   */
  onDeleted?: () => void;
  /** Trigger size — `sm` in a table row, the default on a page header. */
  size?: "sm" | "default";
}

/**
 * Delete a product — trigger button + confirm dialog (TASK-427).
 *
 * WHY THIS IS A FEATURE AND NOT TWO COPIES. The same action lives in three
 * places (the list row, the edit page, the read-only card) and each of them has
 * to get the same three things right: the permission gate, the cache
 * invalidation, and above all the copy. A second implementation is a second
 * chance to describe a soft delete as something it is not.
 *
 * WHAT THE SERVER ACTUALLY DOES (`ProductService.delete`): stamps `deletedAt`,
 * sets `isActive = false`, and mangles the unique `slug` and `sku` to
 * `deleted:<id>:<value>` so those slots are free for new products. The row
 * itself is KEPT, so historical order items still resolve their product. The
 * dialog says all three parts, because each one is a decision the operator is
 * about to make without being told: their order history is safe, the address is
 * not reserved for them any more, and «деактивувати» is the reversible action
 * they may actually have wanted.
 *
 * The permission gate is UI-only — `PermissionGuard` + `products:delete` on the
 * route is the real boundary. It exists so a manager without the permission is
 * not handed a button whose only possible outcome is a 403.
 */
export function ProductDeleteAction({
  productId,
  name,
  onDeleted,
  size = "sm",
}: ProductDeleteActionProps) {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [isOpen, setOpen] = useState(false);
  const deleteProduct = useDeleteProduct();

  if (!can(PERM.productsDelete)) {
    return null;
  }

  const handleDelete = () => {
    deleteProduct.mutate(
      { id: productId },
      {
        onSuccess: () => {
          // The list must lose the row, and the product's own detail cache must
          // go too: the panel's staleTime would otherwise re-render a deleted
          // product from cache on the way back into /products/<id> — the exact
          // bug TASK-406 fixed for users.
          void queryClient.invalidateQueries({
            queryKey: getProductControllerAdminFindAllQueryKey(),
          });
          void queryClient.invalidateQueries({
            queryKey: getProductControllerFindByIdQueryKey(productId),
          });
          toast.success(d.deleteToastDone(name));
          setOpen(false);
          onDeleted?.();
        },
        onError: (error) => {
          // The server's own words when it has any (TASK-397): a delete blocked
          // by a business rule explains itself far better than our fallback.
          toast.error(apiErrorMessage(error) ?? d.deleteToastFailed);
        },
      },
    );
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={size}
        className="text-destructive hover:text-destructive"
        onClick={() => setOpen(true)}
      >
        {d.deleteAction}
      </Button>

      <Dialog open={isOpen} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{d.deleteHeading}</DialogTitle>
            <DialogDescription>{d.deleteDescription(name)}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 text-sm text-muted-foreground">
            <p>{d.deleteKeeps}</p>
            <p className="font-medium text-foreground">{d.deleteFrees}</p>
            <p>{d.deleteAlternative}</p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={deleteProduct.isPending}
            >
              {dict.common.cancel}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteProduct.isPending}
            >
              {deleteProduct.isPending ? dict.common.saving : d.deleteConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
