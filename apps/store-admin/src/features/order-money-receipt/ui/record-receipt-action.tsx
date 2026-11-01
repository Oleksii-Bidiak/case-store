"use client";

import { useId, useState, type FormEvent } from "react";
import { BanknoteArrowDownIcon } from "lucide-react";
import { toast } from "@/shared/ui/toast";
import {
  checkMoneyAmount,
  isOrderStaleError,
  manualInKinds,
  moneyRefusalNeedsRefetch,
  moneyWriteErrorMessage,
  ORDER_MONEY_ERROR,
  receiptKindLabel,
  useAdminOrderMoneyControllerRecordReceipt,
  type MoneyInKind,
  type OrderMoneyEntity,
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
import { apiErrorCode, formatKop, kopToInput, parseKop } from "@/shared/lib";

const m = dict.orderMoney;

interface RecordReceiptActionProps {
  money: OrderMoneyEntity;
  /**
   * After a write: the fresh payload the server answered with, or `null` when
   * the block must refetch (a refusal that proves the screen out of date).
   */
  onWritten: (fresh: OrderMoneyEntity | null) => void;
  /** The leading action of the block (money is due) — filled, not outlined. */
  primary?: boolean;
}

/**
 * «Записати надходження» (R2: TASK-2047, TASK-1807) — the one way money that
 * did not come through LiqPay enters the order: NP cash on delivery, cash at the
 * pickup point, cash to the courier, a transfer to the ФОП account.
 *
 * - Kinds are the server's `allowedInKinds` — already narrowed to the order's
 *   delivery, so «Гроші від НП отримано» never appears on a pickup.
 * - The amount is prefilled with what is still due (`balanceKop`) and editable:
 *   a part payment or a prepayment is an ordinary receipt.
 * - Above what is due the note becomes a required reason (overpayment) — the
 *   server refuses it without one (`ORDER_MONEY_OVERPAYMENT_REASON_REQUIRED`).
 * - `expectedUpdatedAt` is the version the operator opened the dialog on, not
 *   the latest poll: a LiqPay callback landing meanwhile is a 409 to show, not
 *   a change to write over.
 *
 * Absent without `orders:write`, and when the order admits no manual receipt.
 */
export function RecordReceiptAction({
  money,
  onWritten,
  primary = false,
}: RecordReceiptActionProps) {
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const kinds = manualInKinds(money);

  if (!can(PERM.ordersWrite) || kinds.length === 0) return null;

  return (
    <>
      <Button
        type="button"
        variant={primary ? "default" : "outline"}
        size="sm"
        onClick={() => setOpen(true)}
      >
        <BanknoteArrowDownIcon aria-hidden="true" />
        {m.receiptAction}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        {open ? (
          <ReceiptDialogBody
            // Seeded once per opening on purpose: the dialog is a decision on
            // the version it was opened on (see the component docblock).
            money={money}
            kinds={kinds}
            onClose={() => setOpen(false)}
            onWritten={onWritten}
          />
        ) : null}
      </Dialog>
    </>
  );
}

function ReceiptDialogBody({
  money,
  kinds,
  onClose,
  onWritten,
}: {
  money: OrderMoneyEntity;
  kinds: MoneyInKind[];
  onClose: () => void;
  onWritten: (fresh: OrderMoneyEntity | null) => void;
}) {
  const record = useAdminOrderMoneyControllerRecordReceipt();
  const ids = useId();
  // Mount-time snapshot: the dialog content mounts on every opening.
  const [opened] = useState(() => ({
    updatedAt: money.updatedAt,
    dueKop: Math.max(money.totals.balanceKop, 0),
  }));
  const [kind, setKind] = useState<MoneyInKind>(kinds[0]);
  const [rawAmount, setRawAmount] = useState(() => kopToInput(opened.dueKop));
  const [note, setNote] = useState("");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  // The server's view of what is due may be newer than ours: once it says
  // "overpayment", the reason is required whatever we computed.
  const [serverWantsReason, setServerWantsReason] = useState(false);

  const typedKop = parseKop(rawAmount);
  const overpaid =
    serverWantsReason || (typedKop !== null && typedKop > opened.dueKop);
  const dueText = formatKop(opened.dueKop);

  const amountId = `${ids}-amount`;
  const noteId = `${ids}-note`;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const amount = checkMoneyAmount(rawAmount);
    const trimmed = note.trim();
    const reasonMissing = overpaid && trimmed.length === 0;
    setAmountError(amount.ok ? null : amount.message);
    setNoteError(reasonMissing ? m.reasonRequired : null);
    if (!amount.ok || reasonMissing) return;

    record.mutate(
      {
        orderId: money.orderId,
        data: {
          kind,
          amountKop: amount.kop,
          note: trimmed.length > 0 ? trimmed : null,
          expectedUpdatedAt: opened.updatedAt,
        },
      },
      {
        onSuccess: (response) => {
          onClose();
          toast.success(m.receiptToast);
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
          if (
            apiErrorCode(error) ===
            ORDER_MONEY_ERROR.OVERPAYMENT_REASON_REQUIRED
          ) {
            setServerWantsReason(true);
            setNoteError(m.reasonRequired);
          }
          setFormError(message);
          if (moneyRefusalNeedsRefetch(error)) onWritten(null);
        },
      },
    );
  };

  const submitLabel =
    typedKop !== null && typedKop > 0
      ? m.receiptSubmit(formatKop(typedKop))
      : m.receiptSubmitBare;

  return (
    <DialogContent>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle>{m.receiptTitle}</DialogTitle>
          <DialogDescription>
            {opened.dueKop > 0
              ? m.receiptDescriptionDue(dueText)
              : m.receiptDescriptionNothingDue}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <span id={`${ids}-kind`} className="text-sm font-medium">
            {m.receiptKindLegend}
          </span>
          <RadioCardGroup
            aria-labelledby={`${ids}-kind`}
            value={kind}
            onValueChange={(value) => setKind(value as MoneyInKind)}
          >
            {kinds.map((option) => (
              <RadioCard
                key={option}
                value={option}
                title={receiptKindLabel(option)}
              />
            ))}
          </RadioCardGroup>
        </div>

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
          <Label htmlFor={noteId}>
            {overpaid ? m.overpaymentReasonLabel : m.noteLabel}
          </Label>
          <Textarea
            id={noteId}
            value={note}
            maxLength={500}
            required={overpaid}
            aria-required={overpaid || undefined}
            aria-invalid={noteError ? true : undefined}
            aria-describedby={
              noteError
                ? `${noteId}-error`
                : overpaid
                  ? `${noteId}-hint`
                  : undefined
            }
            onChange={(event) => {
              setNote(event.target.value);
              setNoteError(null);
            }}
          />
          {overpaid ? (
            <p id={`${noteId}-hint`} className="text-xs text-muted-foreground">
              {m.overpaymentHint(dueText)}
            </p>
          ) : null}
          <FieldError id={`${noteId}-error`}>{noteError}</FieldError>
        </div>

        <FormAlert>{formError}</FormAlert>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={record.isPending}
            onClick={onClose}
          >
            {m.cancel}
          </Button>
          <Button type="submit" disabled={record.isPending}>
            {submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
