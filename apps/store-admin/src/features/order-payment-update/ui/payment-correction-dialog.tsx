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
import { PaymentCorrectionTarget, paymentStatusLabel } from "@/entities/order";

type Target =
  (typeof PaymentCorrectionTarget)[keyof typeof PaymentCorrectionTarget];

interface PaymentCorrectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (values: { paymentStatus: Target; reason: string }) => void;
  disabled?: boolean;
}

const TARGETS: readonly Target[] = [
  PaymentCorrectionTarget.PAID,
  PaymentCorrectionTarget.PARTIALLY_REFUNDED,
];

/**
 * «Виправити помилкову мітку «Кошти повернено»» (TASK-620, decision B-11 №7).
 *
 * The reason is required — the confirm button stays disabled until there is
 * one — because a correction of a money mark with no explanation is the entry
 * an owner cannot interpret later; the server writes it to the action log.
 *
 * Local state only, seeded fresh on every open (the dialog unmounts its
 * content when closed), so there is no async-seeded field to keep in sync
 * (docs/conventions/forms.md).
 */
export function PaymentCorrectionDialog({
  open,
  onOpenChange,
  onConfirm,
  disabled = false,
}: PaymentCorrectionDialogProps) {
  const [target, setTarget] = useState<Target>(PaymentCorrectionTarget.PAID);
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setTarget(PaymentCorrectionTarget.PAID);
      setReason("");
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{dict.orderStatus.paymentCorrectTitle}</DialogTitle>
          <DialogDescription>
            {dict.orderStatus.paymentCorrectDescription}
          </DialogDescription>
        </DialogHeader>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-foreground">
            {dict.orderStatus.paymentCorrectTargetLegend}
          </legend>
          {TARGETS.map((value) => (
            <label
              key={value}
              className="flex items-center gap-2 text-sm text-foreground"
            >
              <input
                type="radio"
                name="payment-correction-target"
                value={value}
                checked={target === value}
                onChange={() => setTarget(value)}
                className="size-4 accent-primary"
              />
              {paymentStatusLabel(value)}
            </label>
          ))}
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="payment-correction-reason">
            {dict.orderStatus.paymentCorrectReason}
          </Label>
          <Textarea
            id="payment-correction-reason"
            value={reason}
            maxLength={500}
            required
            aria-required="true"
            onChange={(event) => setReason(event.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {dict.orderStatus.paymentCorrectCancel}
          </Button>
          <Button
            disabled={disabled || trimmed.length === 0}
            onClick={() =>
              onConfirm({ paymentStatus: target, reason: trimmed })
            }
          >
            {dict.orderStatus.paymentCorrectConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
