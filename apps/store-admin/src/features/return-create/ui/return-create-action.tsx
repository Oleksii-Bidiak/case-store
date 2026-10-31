"use client";

import { useState } from "react";
import { PackageOpenIcon } from "lucide-react";
import { OrderEntityStatus, type OrderEntity } from "@/entities/order";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import { Button } from "@/shared/ui";
import { dict } from "@/shared/config";
import { ReturnCreateDialog } from "./return-create-dialog";

/**
 * Statuses the server accepts a return on — mirrors `RETURNABLE_ORDER_STATUSES`
 * in `return.service.ts`. Offering the action anywhere else could only end in a
 * 400 `RETURN_ORDER_NOT_RETURNABLE`.
 */
const RETURNABLE_STATUSES: readonly string[] = [
  OrderEntityStatus.SHIPPED,
  OrderEntityStatus.DELIVERED,
];

interface ReturnCreateActionProps {
  order: Pick<OrderEntity, "id" | "items" | "status">;
  /**
   * Controlled mode — the order card opens the same dialog from the REFUNDED
   * warning of the status control (TASK-469 → TASK-1963). Uncontrolled when
   * omitted.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * «Оформити повернення» on the order card (TASK-1963).
 *
 * Rendered only for `returns:write` (the create call's own guard) with
 * `orders:read` (the card it sits on), and only on a SHIPPED or DELIVERED
 * order. Nothing while the grant set loads — `can()` answers false then.
 */
export function ReturnCreateAction({
  order,
  open: controlledOpen,
  onOpenChange,
}: ReturnCreateActionProps) {
  const { can } = useAuth();
  const [ownOpen, setOwnOpen] = useState(false);
  const open = controlledOpen ?? ownOpen;
  const setOpen = onOpenChange ?? setOwnOpen;

  if (!can(PERM.returnsWrite) || !can(PERM.ordersRead)) return null;
  if (!RETURNABLE_STATUSES.includes(order.status)) return null;

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <PackageOpenIcon aria-hidden="true" />
        {dict.returns.createAction}
      </Button>
      <ReturnCreateDialog open={open} onOpenChange={setOpen} order={order} />
    </>
  );
}
