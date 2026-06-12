"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Badge, Button } from "@/shared/ui";
import {
  getAdminCategoryControllerFindAllWithProductCountQueryKey,
  useAdminCategoryControllerActivate,
  useAdminCategoryControllerDeactivate,
} from "@/entities/category";

interface CategoryStatusToggleProps {
  categoryId: string;
  isActive: boolean;
}

/**
 * One-click activate/deactivate control rendered in the category table.
 * Invalidates the (prefix-matched) admin category list query on success.
 */
export function CategoryStatusToggle({
  categoryId,
  isActive,
}: CategoryStatusToggleProps) {
  const queryClient = useQueryClient();
  const activate = useAdminCategoryControllerActivate();
  const deactivate = useAdminCategoryControllerDeactivate();

  const isPending = activate.isPending || deactivate.isPending;
  const mutation = isActive ? deactivate : activate;

  const handleToggle = () => {
    if (isPending) return;
    mutation.mutate(
      { id: categoryId },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey:
              getAdminCategoryControllerFindAllWithProductCountQueryKey(),
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
      aria-label={isActive ? "Deactivate category" : "Activate category"}
    >
      <Badge variant={isActive ? "default" : "secondary"}>
        {isActive ? "Active" : "Inactive"}
      </Badge>
    </Button>
  );
}
