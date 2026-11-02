"use client";

import { useId, useState, type FormEvent } from "react";
import { BanknoteArrowUpIcon } from "lucide-react";
import { toast } from "@/shared/ui/toast";
import {
  checkMoneyAmount,
  isOrderStaleError,
  moneyRefusalNeedsRefetch,
  moneyWriteErrorMessage,
  MoneyOutKind,
  payoutKindLabel,
  useAdminOrderMoneyControllerRecordPayout,
  type OrderMoneyEntity,
  type OrderMoneyRefundablePaymentEntity,
} from "@/entities/order";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FieldError,
  FormAlert,
  Input,
  Label,
  RadioCard,
  RadioCardGroup,
  Textarea,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { formatKop, kopToInput, parseKop } from "@/shared/lib";

const m = dict.orderMoney;

/**
 * A payout FOR a return (R2, TASK-2046): the return it settles and what may
 * still go out on it — `returnPayoutDueKop`, i.e. what is owed on the return
 * capped by what the order still holds. The amount is prefilled with it and
 * may be lowered: a return is paid out in parts.
 */
export interface PayoutForReturn {
  returnId: string;
  dueKop: number;
}

interface RecordPayoutActionProps {
  money: OrderMoneyEntity;
  /** See `RecordReceiptAction` — the fresh payload, or `null` to refetch. */
  onWritten: (fresh: OrderMoneyEntity | null) => void;
  /** Present on the return page; absent on the order's «Оплата» block. */
  forReturn?: PayoutForReturn;
}

/**
 * «Повернути гроші» WITHOUT a return (R2: TASK-2047, TASK-951) — on a cancelled
 * order that was paid, or for what the customer overpaid. Money for shipped
 * goods goes back through a return instead (B2), and the block says so where
 * this button would be.
 *
 * - Shown only while the server's `outWithoutReturnMaxKop` is above zero: that
 *   figure IS the rule (cancelled ⇒ paid − refunded, otherwise the
 *   overpayment), so it is not re-derived here.
 * - Cash at the point, a bank transfer, or LiqPay back to the card. LiqPay
 *   needs the attempt (`refundablePayments`, null for a reader without
 *   `payments:read`) and is capped by what is left on it; the entry then waits
 *   for the provider's confirmation.
 * - The submit button repeats the exact amount — the moment to catch «4990»
 *   typed for «499,0».
 *
 * Absent without `payments:refund`.
 *
 * With `forReturn` (R2, TASK-2046) the same dialog is «Виплатити» on the return
 * page: it sends `returnId`, is capped by what is due on that return, and
 * needs `returns:write` as well — the server asks for both.
 */
export function RecordPayoutAction({
  money,
  onWritten,
  forReturn,
}: RecordPayoutActionProps) {
  const { can } = useAuth();
  const [open, setOpen] = useState(false);

  if (!can(PERM.paymentsRefund)) return null;
  if (forReturn) {
    if (!can(PERM.returnsWrite) || forReturn.dueKop <= 0) return null;
  } else if (money.outWithoutReturnMaxKop <= 0) {
    return null;
  }

  return (
    <>
      <Button
        type="button"
        variant={forReturn ? "default" : "outline"}
        size="sm"
        onClick={() => setOpen(true)}
      >
        <BanknoteArrowUpIcon aria-hidden="true" />
        {forReturn ? m.payoutForReturnAction : m.payoutAction}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        {open ? (
          <PayoutDialogBody
            money={money}
            forReturn={forReturn}
            onClose={() => setOpen(false)}
            onWritten={onWritten}
          />
        ) : null}
      </Dialog>
    </>
  );
}

function PayoutDialogBody({
  money,
  forReturn,
  onClose,
  onWritten,
}: {
  money: OrderMoneyEntity;
  forReturn?: PayoutForReturn;
  onClose: () => void;
  onWritten: (fresh: OrderMoneyEntity | null) => void;
}) {
  const payout = useAdminOrderMoneyControllerRecordPayout();
  const ids = useId();
  // Mount-time snapshot: the decision is taken on the version it was opened on.
  const [opened] = useState(() => ({
    updatedAt: money.updatedAt,
    maxKop: forReturn ? forReturn.dueKop : money.outWithoutReturnMaxKop,
    attempts: (money.refundablePayments ?? []).filter(
      (attempt) => attempt.remainingKop > 0,
    ),
  }));
  const methods: MoneyOutKind[] = [
    MoneyOutKind.CASH_REFUND,
    MoneyOutKind.TRANSFER_REFUND,
    ...(opened.attempts.length > 0 ? [MoneyOutKind.LIQPAY_REFUND] : []),
  ];
  const [kind, setKind] = useState<MoneyOutKind>(MoneyOutKind.CASH_REFUND);
  const [paymentId, setPaymentId] = useState<string>(
    () => opened.attempts[0]?.paymentId ?? "",
  );
  const [rawAmount, setRawAmount] = useState(() => kopToInput(opened.maxKop));
  const [reason, setReason] = useState("");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  // A return is its own «why»; without one the reason is the only record of it
  // (R2 pre-merge review — the server refuses a blank one too).
  const reasonRequired = !forReturn;

  const attempt: OrderMoneyRefundablePaymentEntity | undefined =
    kind === MoneyOutKind.LIQPAY_REFUND
      ? opened.attempts.find((row) => row.paymentId === paymentId)
      : undefined;
  // Both figures are the server's; the smaller one binds.
  const maxKop = attempt
    ? Math.min(opened.maxKop, attempt.remainingKop)
    : opened.maxKop;

  const typedKop = parseKop(rawAmount);
  const amountId = `${ids}-amount`;
  const reasonId = `${ids}-reason`;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const amount = checkMoneyAmount(rawAmount, maxKop);
    setAmountError(amount.ok ? null : amount.message);
    const trimmed = reason.trim();
    const reasonMissing = reasonRequired && trimmed.length === 0;
    setReasonError(reasonMissing ? m.reasonRequired : null);
    if (!amount.ok || reasonMissing) return;

    payout.mutate(
      {
        orderId: money.orderId,
        data: {
          kind,
          amountKop: amount.kop,
          ...(forReturn ? { returnId: forReturn.returnId } : {}),
          ...(kind === MoneyOutKind.LIQPAY_REFUND ? { paymentId } : {}),
          reason: trimmed.length > 0 ? trimmed : null,
          expectedUpdatedAt: opened.updatedAt,
        },
      },
      {
        onSuccess: (response) => {
          onClose();
          toast.success(
            kind === MoneyOutKind.LIQPAY_REFUND
              ? m.payoutLiqpayToast
              : m.payoutToast,
          );
          onWritten(response.data);
        },
        onError: (error) => {
          const message = moneyWriteErrorMessage(error);
          if (isOrderStaleError(error)) {
            onClose();
            toast.error(message);
            onWritten(null);
            return;
          }
          setFormError(message);
          if (moneyRefusalNeedsRefetch(error)) onWritten(null);
        },
      },
    );
  };

  return (
    <DialogContent>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle>
            {forReturn ? m.payoutForReturnTitle : m.payoutTitle}
          </DialogTitle>
          <DialogDescription>
            {forReturn
              ? m.payoutForReturnDescription(formatKop(opened.maxKop))
              : m.payoutDescription(formatKop(opened.maxKop))}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <span id={`${ids}-method`} className="text-sm font-medium">
            {m.payoutMethodLegend}
          </span>
          <RadioCardGroup
            aria-labelledby={`${ids}-method`}
            value={kind}
            onValueChange={(value) => {
              setKind(value as MoneyOutKind);
              setAmountError(null);
            }}
          >
            {methods.map((method) => (
              <RadioCard
                key={method}
                value={method}
                title={payoutKindLabel(method)}
                description={
                  method === MoneyOutKind.LIQPAY_REFUND
                    ? m.payoutLiqpayHint
                    : undefined
                }
              />
            ))}
          </RadioCardGroup>
        </div>

        {kind === MoneyOutKind.LIQPAY_REFUND ? (
          <div className="flex flex-col gap-2">
            <span id={`${ids}-attempt`} className="text-sm font-medium">
              {m.payoutAttemptLabel}
            </span>
            <RadioCardGroup
              aria-labelledby={`${ids}-attempt`}
              value={paymentId}
              onValueChange={(value) => {
                setPaymentId(value);
                setAmountError(null);
              }}
            >
              {opened.attempts.map((row) => (
                <RadioCard
                  key={row.paymentId}
                  value={row.paymentId}
                  title={m.payoutAttemptOption(
                    `#${row.paymentId.slice(0, 8).toUpperCase()}`,
                    formatKop(row.remainingKop),
                  )}
                />
              ))}
            </RadioCardGroup>
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={amountId}>{m.amountLabel}</Label>
          <Input
            id={amountId}
            inputMode="decimal"
            autoComplete="off"
            value={rawAmount}
            aria-invalid={amountError ? true : undefined}
            aria-describedby={
              amountError ? `${amountId}-error` : `${amountId}-hint`
            }
            onChange={(event) => {
              setRawAmount(event.target.value);
              setAmountError(null);
            }}
          />
          <p id={`${amountId}-hint`} className="text-xs text-muted-foreground">
            {m.amountHint}
          </p>
          <FieldError id={`${amountId}-error`}>{amountError}</FieldError>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={reasonId}>
            {reasonRequired ? m.reasonLabel : m.payoutCommentLabel}
          </Label>
          <Textarea
            id={reasonId}
            value={reason}
            maxLength={500}
            required={reasonRequired}
            aria-required={reasonRequired || undefined}
            aria-invalid={reasonError ? true : undefined}
            aria-describedby={
              reasonError
                ? `${reasonId}-error`
                : reasonRequired
                  ? `${reasonId}-hint`
                  : undefined
            }
            onChange={(event) => {
              setReason(event.target.value);
              setReasonError(null);
            }}
          />
          {reasonRequired ? (
            <p
              id={`${reasonId}-hint`}
              className="text-xs text-muted-foreground"
            >
              {m.payoutReasonHint}
            </p>
          ) : null}
          <FieldError id={`${reasonId}-error`}>{reasonError}</FieldError>
        </div>

        <FormAlert>{formError}</FormAlert>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={payout.isPending}
            onClick={onClose}
          >
            {m.cancel}
          </Button>
          <Button
            type="submit"
            variant="destructive"
            disabled={payout.isPending}
          >
            {typedKop !== null && typedKop > 0
              ? forReturn
                ? m.payoutForReturnSubmit(formatKop(typedKop))
                : m.payoutSubmit(formatKop(typedKop))
              : forReturn
                ? m.payoutForReturnAction
                : m.payoutSubmitBare}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
