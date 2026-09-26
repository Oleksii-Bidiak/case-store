"use client";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import { Badge, Button } from "@/shared/ui";
import { dict } from "@/shared/config";
import {
  getAdminListDiscountsQueryKey,
  useAdminDeactivateDiscount,
} from "@/entities/discount";
import { useStatusToggle } from "@/features/bulk-status";

interface DiscountStatusToggleProps {
  discountId: string;
  isActive: boolean;
}

/**
 * Status cell for the discount table: an active code shows a one-click
 * "deactivate" button (soft-deactivate via DELETE); an inactive code shows a
 * muted badge. Re-activation is done through the edit form (`isActive` toggle),
 * mirroring the single soft-deactivate endpoint — hence no `activate` passed to
 * the shared `useStatusToggle` engine (TASK-812). Invalidates the admin list on
 * success.
 */
export function DiscountStatusToggle({
  discountId,
  isActive,
}: DiscountStatusToggleProps) {
  const queryClient = useQueryClient();
  const deactivate = useAdminDeactivateDiscount();

  const { toggle, isPending } = useStatusToggle({
    id: discountId,
    isActive,
    deactivate,
    onWritten: () => {
      void queryClient.invalidateQueries({
        queryKey: getAdminListDiscountsQueryKey(),
      });
      toast.success(dict.discounts.toastDeactivated);
    },
    onFailed: () => {
      toast.error(dict.discounts.toastDeactivateFailed);
    },
  });

  if (!isActive) {
    return <Badge variant="secondary">{dict.discounts.statusInactive}</Badge>;
  }

  return (
    <Button variant="outline" size="sm" onClick={toggle} disabled={isPending}>
      {isPending ? dict.discounts.deactivating : dict.discounts.deactivate}
    </Button>
  );
}
