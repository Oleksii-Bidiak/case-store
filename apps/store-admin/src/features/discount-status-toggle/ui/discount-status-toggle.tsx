"use client";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge, Button } from "@/shared/ui";
import { dict } from "@/shared/config";
import {
  getAdminListDiscountsQueryKey,
  useAdminDeactivateDiscount,
} from "@/entities/discount";

interface DiscountStatusToggleProps {
  discountId: string;
  isActive: boolean;
}

/**
 * Status cell for the discount table: an active code shows a one-click
 * "deactivate" button (soft-deactivate via DELETE); an inactive code shows a
 * muted badge. Re-activation is done through the edit form (`isActive` toggle),
 * mirroring the single soft-deactivate endpoint. Invalidates the admin list on
 * success.
 */
export function DiscountStatusToggle({
  discountId,
  isActive,
}: DiscountStatusToggleProps) {
  const queryClient = useQueryClient();
  const deactivate = useAdminDeactivateDiscount();

  if (!isActive) {
    return <Badge variant="secondary">{dict.discounts.statusInactive}</Badge>;
  }

  const handleDeactivate = () => {
    if (deactivate.isPending) return;
    deactivate.mutate(
      { id: discountId },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getAdminListDiscountsQueryKey(),
          });
          toast.success(dict.discounts.toastDeactivated);
        },
        onError: () => {
          toast.error(dict.discounts.toastDeactivateFailed);
        },
      },
    );
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleDeactivate}
      disabled={deactivate.isPending}
    >
      {deactivate.isPending
        ? dict.discounts.deactivating
        : dict.discounts.deactivate}
    </Button>
  );
}
