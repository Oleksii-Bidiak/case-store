"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Badge, Button } from "@/shared/ui";
import { dict } from "@/shared/config";
import {
  getProductControllerAdminFindAllQueryKey,
  useProductControllerActivate,
  useProductControllerDeactivate,
} from "@/entities/product";

interface ProductStatusToggleProps {
  productId: string;
  isActive: boolean;
}

/**
 * One-click activate/deactivate control rendered in the product table.
 *
 * Invalidates the (prefix-matched) product list query on success so the table
 * reflects the new status. The base query key matches every paginated/filtered
 * variant of the list.
 */
export function ProductStatusToggle({
  productId,
  isActive,
}: ProductStatusToggleProps) {
  const queryClient = useQueryClient();
  const activate = useProductControllerActivate();
  const deactivate = useProductControllerDeactivate();

  const isPending = activate.isPending || deactivate.isPending;
  const mutation = isActive ? deactivate : activate;

  const handleToggle = () => {
    if (isPending) return;
    mutation.mutate(
      { id: productId },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getProductControllerAdminFindAllQueryKey(),
          });
        },
      },
    );
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleToggle}
      disabled={isPending}
      aria-label={
        isActive
          ? dict.statusToggle.productDeactivate
          : dict.statusToggle.productActivate
      }
    >
      <Badge variant={isActive ? "default" : "secondary"}>
        {isActive ? dict.common.active : dict.common.inactive}
      </Badge>
    </Button>
  );
}
