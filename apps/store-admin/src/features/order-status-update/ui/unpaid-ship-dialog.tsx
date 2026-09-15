"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { formatCurrency } from "@/shared/lib";

interface UnpaidShipDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Order total, so the operator sees what is going out unpaid. */
  total: string;
  /** Ship anyway — the operator has decided. */
  onConfirm: () => void;
  disabled?: boolean;
}

/**
 * «Оплату не підтверджено — відправляти?» (TASK-468, decision B-1.1).
 *
 * The owner's rule for this whole wave is that we hard-block only the physically
 * impossible and make everything else VISIBLE. An online order that has not been
 * paid for can still legitimately ship — the customer transferred the money by
 * hand, the callback is late, the operator checked the bank statement — and
 * refusing the move is how a system teaches an operator to lie: they would mark
 * it PAID falsely and we would lose the truth about the money to keep a rule.
 *
 * So this is a speed bump, not a gate. It states the fact, shows the amount, and
 * both buttons are real answers.
 *
 * A REAL DIALOG AND NOT `window.confirm`, which is this project's convention for
 * a bare yes/no: the question is not answerable without the amount, and
 * `window.confirm` cannot render one. It also cannot be read by a screen reader
 * as a labelled surface, which a decision about money deserves.
 */
export function UnpaidShipDialog({
  open,
  onOpenChange,
  total,
  onConfirm,
  disabled = false,
}: UnpaidShipDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{dict.orderStatus.unpaidShipTitle}</DialogTitle>
          <DialogDescription>
            {dict.orderStatus.unpaidShipDescription}
          </DialogDescription>
        </DialogHeader>

        <p className="flex items-baseline justify-between gap-4 rounded-md border border-border p-3 text-sm">
          <span className="text-muted-foreground">
            {dict.orderStatus.unpaidShipAmount}
          </span>
          <span className="font-semibold text-foreground">
            {formatCurrency(total)}
          </span>
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {dict.orderStatus.unpaidShipCancel}
          </Button>
          <Button onClick={onConfirm} disabled={disabled}>
            {dict.orderStatus.unpaidShipConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
