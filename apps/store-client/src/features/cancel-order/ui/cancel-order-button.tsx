"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getGetOrderQueryKey,
  getGetOrdersQueryKey,
  useCancelOrder,
} from "@/entities/order";
import { dict } from "@/shared/config";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/ui";

interface CancelOrderButtonProps {
  orderId: string;
}

/**
 * CancelOrderButton — lets a customer cancel a PENDING order, confirmed via an
 * accessible Dialog (no window.confirm). On success it invalidates both the
 * order list and the single-order query so the history list and the
 * confirmation/detail page reflect the new CANCELLED status without navigation.
 *
 * The parent renders this only when `order.status === 'PENDING'`; the component
 * itself does not re-check status. Mirrors the controlled-dialog pattern in
 * `widgets/cart/ui/cart-summary.tsx`.
 */
export function CancelOrderButton({ orderId }: CancelOrderButtonProps) {
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const cancelOrder = useCancelOrder({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetOrdersQueryKey() });
        queryClient.invalidateQueries({
          queryKey: getGetOrderQueryKey(orderId),
        });
        setConfirmOpen(false);
        toast.success(dict.cancelOrder.success);
      },
      onError: () => toast.error(dict.cancelOrder.error),
    },
  });

  return (
    <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          {dict.cancelOrder.trigger}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{dict.cancelOrder.dialogTitle}</DialogTitle>
          <DialogDescription>
            {dict.cancelOrder.dialogDescription}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{dict.cancelOrder.cancel}</Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={cancelOrder.isPending}
            onClick={() => cancelOrder.mutate({ orderId })}
          >
            {cancelOrder.isPending
              ? dict.cancelOrder.confirming
              : dict.cancelOrder.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
