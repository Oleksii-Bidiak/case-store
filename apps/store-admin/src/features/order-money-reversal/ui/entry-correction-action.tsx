"use client";

import { useId, useState, type FormEvent } from "react";
import { BanIcon, Undo2Icon } from "lucide-react";
import { toast } from "@/shared/ui/toast";
import {
  isOrderStaleError,
  isPendingProviderRefund,
  isReversibleEntry,
  moneyRefusalNeedsRefetch,
  moneyWriteErrorMessage,
  useAdminOrderMoneyControllerReverseEntry,
  useAdminOrderMoneyControllerVoidEntry,
  type OrderMoneyEntity,
  type OrderMoneyEntryEntity,
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
  Label,
  Textarea,
} from "@/shared/ui";
import { dict } from "@/shared/config";

const m = dict.orderMoney;

/** `reverse` — сторно of a manual row; `void` — a LiqPay refund that never went through. */
export type EntryCorrectionMode = "reverse" | "void";

interface EntryCorrectionActionProps {
  mode: EntryCorrectionMode;
  money: Pick<OrderMoneyEntity, "orderId" | "updatedAt">;
  entry: OrderMoneyEntryEntity;
  /** «Оплата на точці, 1 299 ₴, 01.06.2026 13:00» — names the row in the button and the dialog. */
  entryName: string;
  /** See `RecordReceiptAction` — the fresh payload, or `null` to refetch. */
  onWritten: (fresh: OrderMoneyEntity | null) => void;
}

/**
 * «Сторнувати» / «Анулювати запит» on one journal row (R2: TASK-2047, 2337).
 *
 * A wrong entry is never edited or deleted: a reversal (сторно) of the same
 * amount is written beside it and the original stays, struck through. A LiqPay
 * refund still awaiting the provider is voided instead — it never moved money.
 * Both need `payments:correct` and a reason, which lands on the entry and in
 * the action log.
 *
 * The button is drawn only where the server would accept it
 * (`isReversibleEntry` / `isPendingProviderRefund` mirror its rules); a 409
 * from a row that changed meanwhile is shown and the journal refetched.
 */
export function EntryCorrectionAction({
  mode,
  money,
  entry,
  entryName,
  onWritten,
}: EntryCorrectionActionProps) {
  const { can } = useAuth();
  const [open, setOpen] = useState(false);

  if (!can(PERM.paymentsCorrect)) return null;
  const fits =
    mode === "reverse"
      ? isReversibleEntry(entry)
      : isPendingProviderRefund(entry);
  if (!fits) return null;

  const Icon = mode === "reverse" ? Undo2Icon : BanIcon;
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={
          mode === "reverse"
            ? m.reverseActionAria(entryName)
            : m.voidActionAria(entryName)
        }
        onClick={() => setOpen(true)}
      >
        <Icon aria-hidden="true" />
        {mode === "reverse" ? m.reverseAction : m.voidAction}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        {open ? (
          <CorrectionDialogBody
            mode={mode}
            money={money}
            entry={entry}
            entryName={entryName}
            onClose={() => setOpen(false)}
            onWritten={onWritten}
          />
        ) : null}
      </Dialog>
    </>
  );
}

function CorrectionDialogBody({
  mode,
  money,
  entry,
  entryName,
  onClose,
  onWritten,
}: Omit<EntryCorrectionActionProps, "money"> & {
  money: Pick<OrderMoneyEntity, "orderId" | "updatedAt">;
  onClose: () => void;
}) {
  const reverse = useAdminOrderMoneyControllerReverseEntry();
  const voidEntry = useAdminOrderMoneyControllerVoidEntry();
  const mutation = mode === "reverse" ? reverse : voidEntry;
  const ids = useId();
  // Mount-time snapshot of the lock token — see `RecordReceiptAction`.
  const [expectedUpdatedAt] = useState(() => money.updatedAt);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const reasonId = `${ids}-reason`;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const trimmed = reason.trim();
    if (trimmed.length === 0) {
      setReasonError(m.reasonRequired);
      return;
    }
    const variables = {
      orderId: money.orderId,
      entryId: entry.id,
      data: { reason: trimmed, expectedUpdatedAt },
    };
    const callbacks = {
      onSuccess: (response: { data: OrderMoneyEntity }) => {
        onClose();
        toast.success(mode === "reverse" ? m.reverseToast : m.voidToast);
        onWritten(response.data);
      },
      onError: (error: unknown) => {
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
    };
    if (mode === "reverse") reverse.mutate(variables, callbacks);
    else voidEntry.mutate(variables, callbacks);
  };

  return (
    <DialogContent>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle>
            {mode === "reverse" ? m.reverseTitle : m.voidTitle}
          </DialogTitle>
          <DialogDescription>
            {mode === "reverse"
              ? m.reverseDescription(entryName)
              : m.voidDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={reasonId}>{m.reasonLabel}</Label>
          <Textarea
            id={reasonId}
            value={reason}
            maxLength={500}
            required
            aria-required
            aria-invalid={reasonError ? true : undefined}
            aria-describedby={reasonError ? `${reasonId}-error` : undefined}
            onChange={(event) => {
              setReason(event.target.value);
              setReasonError(null);
            }}
          />
          <FieldError id={`${reasonId}-error`}>{reasonError}</FieldError>
        </div>

        <FormAlert>{formError}</FormAlert>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={mutation.isPending}
            onClick={onClose}
          >
            {m.cancel}
          </Button>
          <Button
            type="submit"
            variant="destructive"
            disabled={mutation.isPending}
          >
            {mode === "reverse" ? m.reverseSubmit : m.voidSubmit}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
