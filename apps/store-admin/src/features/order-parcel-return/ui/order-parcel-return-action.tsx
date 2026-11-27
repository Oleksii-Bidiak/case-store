"use client";

import { PackageCheckIcon } from "lucide-react";
import type { OrderEntity } from "@/entities/order";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import { Button, useConfirmDialog } from "@/shared/ui";
import { dict } from "@/shared/config";
import { useOrderParcelReturn } from "../model/use-order-parcel-return";

const d = dict.orders;

interface OrderParcelReturnActionProps {
  order: Pick<OrderEntity, "id" | "items" | "canReturnParcel">;
}

/**
 * «Посилку повернуто на склад» on the order card (TASK-2575).
 *
 * Offered only where the server says it applies (`canReturnParcel`: cancelled
 * after shipping, not yet restocked, no live return request) and only to
 * `orders:write`, which the endpoint requires — a button that can only 403 or
 * 409 reads as a broken page. The write is one-way, so it asks first and lists
 * exactly what goes back on the shelf.
 */
export function OrderParcelReturnAction({
  order,
}: OrderParcelReturnActionProps) {
  const { can, arePermissionsLoading } = useAuth();
  const { returnParcel, isPending } = useOrderParcelReturn(order.id);
  const { confirm, confirmDialog } = useConfirmDialog();

  if (arePermissionsLoading || !can(PERM.ordersWrite)) return null;
  if (!order.canReturnParcel) return null;

  const onClick = async () => {
    const confirmed = await confirm({
      title: d.parcelReturnConfirmTitle,
      description: (
        <>
          {d.parcelReturnConfirmDescription}
          {order.items.map((item) => (
            // The description is a <p>: block spans, not a list, keep it valid.
            <span key={item.id} className="mt-1 block text-foreground">
              {d.parcelReturnLine(item.productName, item.quantity)}
            </span>
          ))}
        </>
      ),
      confirmLabel: d.parcelReturnConfirm,
    });
    if (confirmed) returnParcel();
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={isPending}
        onClick={() => void onClick()}
      >
        <PackageCheckIcon aria-hidden="true" />
        {d.parcelReturnAction}
      </Button>
      {confirmDialog}
    </>
  );
}
