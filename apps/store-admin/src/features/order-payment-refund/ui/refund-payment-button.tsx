"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  getAdminOrderControllerFindByIdQueryKey,
  getAdminOrderControllerGetHistoryQueryKey,
} from "@/entities/order";
import {
  getAdminListOrderPaymentsQueryKey,
  useAdminRefundPayment,
  type PaymentEntity,
} from "@/entities/payment";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { formatCurrency } from "@/shared/lib";
import {
  parseRefundAmount,
  refundableRemainder,
  toKopiykas,
} from "../model/refund-amount";
import { refundErrorKind, refundErrorMessage } from "../model/refund-error";

interface RefundPaymentButtonProps {
  orderId: string;
  payment: Pick<PaymentEntity, "id" | "amount" | "refundedAmount">;
}

type Mode = "full" | "partial";
type Step = "edit" | "confirm";

const t = dict.orders;

/**
 * «Повернути кошти» on one SUCCEEDED payment attempt (TASK-371) — the first
 * control in the admin panel that moves real money, so it is deliberately slow:
 *
 * 1. The operator picks what is left on the attempt or types a part of it. The
 *    part is validated like the server validates it (decimal string, > 0, ≤ the
 *    attempt's remainder after earlier refunds, TASK-1302) and the message sits
 *    under the field.
 * 2. A confirmation step repeats the EXACT sum that will be sent — the one
 *    moment to catch «4990» typed for «499.0».
 * 3. The request answers 202, which means *requested*, nothing more. The toast
 *    says so, and NO badge is flipped: the payment becomes refunded only when
 *    LiqPay's callback says it did (the rule `AdminPaymentController` states).
 *
 * The button stays disabled while the request is in flight and, after a 202,
 * for the rest of this visit. The server is the real boundary: it reserves
 * every refund against the attempt's remainder in one conditional UPDATE
 * (TASK-1302), so neither a second click nor a second tab can send back more
 * than was paid; the refetched list then shows the smaller remainder.
 *
 * «All of it» travels as the explicit remainder this card showed, not as an
 * omitted amount: were the list stale, an omitted amount would refund a sum
 * other than the one the operator confirmed, where an explicit one gets a 400
 * and the field back.
 *
 * Local state only, reset on every open (the dialog content unmounts when
 * closed), so there is no async-seeded field to keep in sync
 * (docs/conventions/forms.md).
 */
export function RefundPaymentButton({
  orderId,
  payment,
}: RefundPaymentButtonProps) {
  const queryClient = useQueryClient();
  const refund = useAdminRefundPayment();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("edit");
  const [mode, setMode] = useState<Mode>("full");
  const [rawAmount, setRawAmount] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [confirmedAmount, setConfirmedAmount] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);

  const fullAmount = formatCurrency(payment.amount);
  const remainder = refundableRemainder(payment);
  const remainderAmount = formatCurrency(remainder);
  const partlyRefunded = toKopiykas(payment.refundedAmount) > 0;

  const reset = () => {
    setStep("edit");
    setMode("full");
    setRawAmount("");
    setFieldError(null);
    setConfirmedAmount(null);
  };

  const handleOpenChange = (next: boolean) => {
    // Never close under a request in flight — the outcome must be seen.
    if (!next && refund.isPending) return;
    if (!next) reset();
    setOpen(next);
  };

  const handleNext = () => {
    if (mode === "full") {
      setConfirmedAmount(null);
      setStep("confirm");
      return;
    }
    const parsed = parseRefundAmount(rawAmount, remainder);
    if (!parsed.ok) {
      setFieldError(parsed.message);
      return;
    }
    setFieldError(null);
    setConfirmedAmount(parsed.amount);
    setStep("confirm");
  };

  const handleConfirm = () => {
    refund.mutate(
      {
        paymentId: payment.id,
        // Always explicit — see the component docblock.
        data: { amount: confirmedAmount ?? remainder },
      },
      {
        onSuccess: () => {
          setRequested(true);
          reset();
          setOpen(false);
          toast.success(t.refundRequested);
          // Nothing has changed yet — but the callback may land any second,
          // and these are the three views it changes.
          void queryClient.invalidateQueries({
            queryKey: getAdminListOrderPaymentsQueryKey(orderId),
          });
          void queryClient.invalidateQueries({
            queryKey: getAdminOrderControllerFindByIdQueryKey(orderId),
          });
          void queryClient.invalidateQueries({
            queryKey: getAdminOrderControllerGetHistoryQueryKey(orderId),
          });
        },
        onError: (error) => {
          const kind = refundErrorKind(error);
          if (kind === "tooLarge") {
            // The number is what is wrong: back to it, message under it.
            setStep("edit");
            setMode("partial");
            setRawAmount(confirmedAmount ?? remainder);
            setFieldError(refundErrorMessage(error));
            // Someone refunded meanwhile: show the remainder as it is now.
            void queryClient.invalidateQueries({
              queryKey: getAdminListOrderPaymentsQueryKey(orderId),
            });
            return;
          }
          if (kind === "conflict") {
            // The attempt is no longer SUCCEEDED — show the list as it is.
            void queryClient.invalidateQueries({
              queryKey: getAdminListOrderPaymentsQueryKey(orderId),
            });
          }
          reset();
          setOpen(false);
          toast.error(refundErrorMessage(error));
        },
      },
    );
  };

  const amountToShow =
    confirmedAmount === null
      ? remainderAmount
      : formatCurrency(confirmedAmount);
  const inputId = `refund-amount-${payment.id}`;
  const errorId = `${inputId}-error`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={requested || refund.isPending}
        onClick={() => setOpen(true)}
      >
        {t.refundAction}
      </Button>
      {requested ? (
        <span role="status" className="text-xs text-muted-foreground">
          {t.refundPending}
        </span>
      ) : null}

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {step === "edit" ? t.refundTitle : t.refundConfirmTitle}
            </DialogTitle>
            <DialogDescription>
              {step === "edit"
                ? t.refundDescription(fullAmount)
                : t.refundConfirmText(amountToShow)}
            </DialogDescription>
          </DialogHeader>

          {step === "edit" ? (
            <div className="flex flex-col gap-3">
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium text-foreground">
                  {t.refundModeLegend}
                </legend>
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="radio"
                    name={`refund-mode-${payment.id}`}
                    value="full"
                    checked={mode === "full"}
                    onChange={() => {
                      setMode("full");
                      setFieldError(null);
                    }}
                    className="size-4 accent-primary"
                  />
                  {partlyRefunded
                    ? t.refundModeRemainder(remainderAmount)
                    : t.refundModeFull(remainderAmount)}
                </label>
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="radio"
                    name={`refund-mode-${payment.id}`}
                    value="partial"
                    checked={mode === "partial"}
                    onChange={() => setMode("partial")}
                    className="size-4 accent-primary"
                  />
                  {t.refundModePartial}
                </label>
              </fieldset>

              {mode === "partial" ? (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={inputId}>{t.refundAmountLabel}</Label>
                  <Input
                    id={inputId}
                    inputMode="decimal"
                    autoComplete="off"
                    value={rawAmount}
                    aria-invalid={fieldError ? true : undefined}
                    aria-describedby={fieldError ? errorId : `${inputId}-hint`}
                    onChange={(event) => {
                      setRawAmount(event.target.value);
                      setFieldError(null);
                    }}
                  />
                  <p
                    id={`${inputId}-hint`}
                    className="text-xs text-muted-foreground"
                  >
                    {t.refundAmountHint}
                  </p>
                  {fieldError ? (
                    <p
                      id={errorId}
                      role="alert"
                      className="text-xs text-destructive"
                    >
                      {fieldError}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            {step === "edit" ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                >
                  {t.refundCancel}
                </Button>
                <Button type="button" onClick={handleNext}>
                  {t.refundNext}
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={refund.isPending}
                  onClick={() => setStep("edit")}
                >
                  {t.refundBack}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={refund.isPending}
                  onClick={handleConfirm}
                >
                  {t.refundConfirm(amountToShow)}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
