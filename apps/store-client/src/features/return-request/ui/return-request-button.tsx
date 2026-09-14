"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getGetOrderReturnsQueryKey,
  useCreateReturn,
  useGetOrderReturns,
} from "@/entities/return";
import { dict } from "@/shared/config";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Textarea,
} from "@/shared/ui";
import {
  clampQuantity,
  returnableLines,
  type OrderLine,
} from "../model/returnable-units";

interface ReturnRequestButtonProps {
  orderId: string;
  /** Short order number, as it is written everywhere else on the storefront. */
  orderNumber: string;
  items: readonly OrderLine[];
}

/**
 * «Подати заяву на повернення» (TASK-373).
 *
 * Ukrainian law gives 14 days to return, `POST /orders/:orderId/returns` has
 * existed since TASK-340, and until now nothing in the storefront called it: the
 * account area had no button, so the only way a customer could open a return was
 * to write to support and have an operator do something the panel could not do
 * either (that half is TASK-469). This is the customer's door.
 *
 * WHY THE QUANTITIES ARE COMPUTED AND NOT ASSUMED. A line may be returned across
 * several requests — three bought, one back today, another next week — so the
 * server caps the SUM of live claims, not one request. The form asks the API what
 * is already claimed and offers only the remainder. Without it the obvious input
 * (the full quantity) is the one the server refuses, and a customer reads that as
 * a broken shop rather than as arithmetic.
 *
 * The dialog is the same controlled-`Dialog` pattern as `CancelOrderButton` —
 * never `window.confirm`, which cannot render a line list.
 */
export function ReturnRequestButton({
  orderId,
  orderNumber,
  items,
}: ReturnRequestButtonProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");

  // Asked only while the dialog is open: on a history page of twenty orders,
  // twenty speculative requests for something nobody has clicked is a page that
  // loads slowly for everyone to help the one person who will.
  const { data, isError } = useGetOrderReturns(orderId, {
    query: { enabled: open },
  });

  const createReturn = useCreateReturn({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: getGetOrderReturnsQueryKey(orderId),
        });
        toast.success(dict.returnRequest.success);
        close();
      },
      onError: (error) => {
        // 400 is the server's "those units are no longer returnable" — a
        // different instruction from "try again", because retrying the same
        // numbers cannot work.
        const status = (error as { response?: { status?: number } })?.response
          ?.status;
        toast.error(
          status === 400
            ? dict.returnRequest.conflict
            : dict.returnRequest.error,
        );
      },
    },
  });

  const lines = returnableLines(items, data?.data ?? []);
  const selected = lines
    .map((line) => ({
      orderItemId: line.orderItemId,
      quantity: clampQuantity(
        quantities[line.orderItemId] ?? 0,
        line.remaining,
      ),
    }))
    .filter((line) => line.quantity > 0);

  function close() {
    setOpen(false);
    setQuantities({});
    setReason("");
  }

  const handleSubmit = () => {
    if (selected.length === 0) return;
    createReturn.mutate({
      orderId,
      data: {
        ...(reason.trim() ? { reason: reason.trim() } : {}),
        items: selected,
      },
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? setOpen(true) : close())}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={dict.returnRequest.triggerAria(orderNumber)}
        >
          {dict.returnRequest.trigger}
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{dict.returnRequest.dialogTitle}</DialogTitle>
          <DialogDescription>
            {dict.returnRequest.dialogDescription}
          </DialogDescription>
        </DialogHeader>

        {isError ? (
          <p role="alert" className="text-sm text-destructive">
            {dict.returnRequest.loadError}
          </p>
        ) : null}

        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-foreground">
            {dict.returnRequest.itemsHeading}
          </p>
          <ul className="flex flex-col gap-3">
            {lines.map((line) => (
              <li
                key={line.orderItemId}
                className="flex flex-wrap items-center justify-between gap-3"
              >
                <span className="flex flex-col">
                  <span className="text-sm text-foreground">
                    {line.productName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {line.remaining === 0
                      ? dict.returnRequest.nothingLeft
                      : dict.returnRequest.remainingOf(
                          line.remaining,
                          line.ordered,
                        )}
                  </span>
                </span>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={line.remaining}
                  disabled={line.remaining === 0}
                  aria-label={dict.returnRequest.quantityAria(line.productName)}
                  value={quantities[line.orderItemId] ?? 0}
                  onChange={(event) =>
                    setQuantities((previous) => ({
                      ...previous,
                      [line.orderItemId]: clampQuantity(
                        Number(event.target.value),
                        line.remaining,
                      ),
                    }))
                  }
                  className="w-20"
                />
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={`return-reason-${orderId}`}>
            {dict.returnRequest.reason}
          </Label>
          <Textarea
            id={`return-reason-${orderId}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={dict.returnRequest.reasonPlaceholder}
            rows={3}
          />
          <p className="text-xs text-muted-foreground">
            {dict.returnRequest.reasonHint}
          </p>
        </div>

        <DialogFooter className="items-center">
          {/* A live hint rather than a disabled button with no explanation: a
              control that does nothing and says nothing reads as a broken form. */}
          {selected.length === 0 ? (
            <p className="mr-auto text-xs text-muted-foreground">
              {dict.returnRequest.nothingSelected}
            </p>
          ) : null}
          <Button variant="outline" onClick={close}>
            {dict.returnRequest.cancel}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={selected.length === 0 || createReturn.isPending}
          >
            {createReturn.isPending
              ? dict.returnRequest.submitting
              : dict.returnRequest.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
