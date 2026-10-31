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

interface RefundNoReturnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Short order number, as it is written everywhere else in the panel. */
  orderNumber: string;
  /** Open «Оформити повернення» instead — the status stays where it is. */
  onCreateReturn: () => void;
  /** Move the order anyway — a real answer, not a cancel. */
  onSkip: () => void;
  disabled?: boolean;
}

/**
 * «Повернення коштів без заявки?» (TASK-469, reworked by TASK-1963).
 *
 * Asked when an operator moves an order to REFUNDED and no `Return` exists for
 * it. It used to file a return on the WHOLE order and then move the status; a
 * return is now its own action with lines and quantities («Оформити
 * повернення»), so this only points there. Choosing it does not change the
 * status — filing a request says what the buyer asked for, not that money went
 * back.
 *
 * IT DOES NOT BLOCK: refunds happen with no goods coming back at all (a
 * duplicate charge, a goodwill gesture), so «Лише змінити статус» is an answer,
 * not an escape.
 */
export function RefundNoReturnDialog({
  open,
  onOpenChange,
  orderNumber,
  onCreateReturn,
  onSkip,
  disabled = false,
}: RefundNoReturnDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{dict.orderStatus.refundNoReturnTitle}</DialogTitle>
          <DialogDescription>
            {dict.orderStatus.refundNoReturnDescription(orderNumber)}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="outline" onClick={onSkip} disabled={disabled}>
            {dict.orderStatus.refundNoReturnSkip}
          </Button>
          <Button onClick={onCreateReturn} disabled={disabled}>
            {dict.orderStatus.refundNoReturnCreate}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
