"use client";

import { useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Textarea,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { formatCurrency } from "@/shared/lib";

/** The order lines the dialog offers to return — the whole order, prefilled. */
export interface ReturnableLine {
  id: string;
  productName: string;
  quantity: number;
  lineTotal: string;
}

interface CreateReturnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Short order number, as it is written everywhere else in the panel. */
  orderNumber: string;
  items: readonly ReturnableLine[];
  /** Open the return, then move the order. */
  onCreate: (reason: string) => void;
  /** Decline the return and move the order anyway — a real answer, not a cancel. */
  onSkip: () => void;
  disabled?: boolean;
}

/**
 * «Створити заявку на все замовлення?» (TASK-469, decision B-1.2).
 *
 * Asked when an operator moves an order to REFUNDED and no `Return` exists for
 * it. `Return` is the source of truth about a return — it carries the lines, the
 * quantities, the reason, and it is what credits stock back; `OrderStatus.REFUNDED`
 * is a derived label meaning "money went back on this order". Setting the label
 * with no record behind it is edge case E-12 exactly: a refund with no lines, no
 * quantities and no stock movement, which nobody can audit a month later.
 *
 * IT DOES NOT BLOCK, and that is deliberate rather than lenient. Refunds happen
 * for reasons that have no returning goods at all — a cancelled pre-order, a
 * duplicate charge, a goodwill gesture — and forcing a return record for those
 * would fill the queue with fictions and, worse, credit stock the shop never got
 * back. So «Лише змінити статус» is an answer, not an escape.
 *
 * PREFILLED WITH THE WHOLE ORDER because that is the case being asked about: a
 * partial return is opened deliberately, line by line, from the customer's own
 * form or by the operator on the returns screen. The quantities are shown and not
 * editable here — an operator who wants a different set is doing a different
 * thing, and a half-editable dialog in the middle of a status change is how the
 * wrong quantity gets refunded.
 */
export function CreateReturnDialog({
  open,
  onOpenChange,
  orderNumber,
  items,
  onCreate,
  onSkip,
  disabled = false,
}: CreateReturnDialogProps) {
  const [reason, setReason] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{dict.returns.createDialogTitle}</DialogTitle>
          <DialogDescription>
            {dict.returns.createDialogDescription(orderNumber)}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-foreground">
            {dict.returns.createDialogItemsHeading}
          </p>
          <ul className="flex flex-col gap-1 rounded-md border border-border p-3">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-baseline justify-between gap-4 text-sm"
              >
                <span className="text-foreground">
                  {item.productName}
                  <span className="text-muted-foreground">
                    {" "}
                    × {item.quantity}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  {formatCurrency(item.lineTotal)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="return-reason">
            {dict.returns.createDialogReason}
          </Label>
          <Textarea
            id="return-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={dict.returns.createDialogReasonPlaceholder}
            rows={3}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onSkip} disabled={disabled}>
            {dict.returns.createDialogSkip}
          </Button>
          <Button onClick={() => onCreate(reason)} disabled={disabled}>
            {dict.returns.createDialogSubmit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
