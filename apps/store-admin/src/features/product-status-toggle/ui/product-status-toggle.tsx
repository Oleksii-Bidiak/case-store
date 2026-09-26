"use client";

import { useQueryClient } from "@tanstack/react-query";
import { StatusToggleButton } from "@/shared/ui/status-toggle-button";
import { dict } from "@/shared/config";
import {
  getProductControllerAdminFindAllQueryKey,
  useProductControllerActivate,
  useProductControllerDeactivate,
} from "@/entities/product";
import { useStatusToggle } from "@/features/bulk-status";

interface ProductStatusToggleProps {
  productId: string;
  isActive: boolean;
}

/**
 * One-click activate/deactivate control rendered in the product table.
 *
 * Invalidates the (prefix-matched) product list query on success so the table
 * reflects the new status. The base query key matches every paginated/filtered
 * variant of the list. The engine is the shared `useStatusToggle` (TASK-812).
 */
export function ProductStatusToggle({
  productId,
  isActive,
}: ProductStatusToggleProps) {
  const queryClient = useQueryClient();
  const activate = useProductControllerActivate();
  const deactivate = useProductControllerDeactivate();

  const { toggle, isPending } = useStatusToggle({
    id: productId,
    isActive,
    activate,
    deactivate,
    onWritten: () => {
      void queryClient.invalidateQueries({
        queryKey: getProductControllerAdminFindAllQueryKey(),
      });
    },
  });

  return (
    <StatusToggleButton
      isActive={isActive}
      isPending={isPending}
      onToggle={toggle}
      activateLabel={dict.statusToggle.productActivate}
      deactivateLabel={dict.statusToggle.productDeactivate}
    />
  );
}
