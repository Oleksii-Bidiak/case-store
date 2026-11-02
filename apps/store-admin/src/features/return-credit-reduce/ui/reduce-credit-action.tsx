"use client";

import { useId, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  getAdminOrderReturnControllerFindForOrderQueryKey,
  getAdminReturnControllerFindAllQueryKey,
  getAdminReturnControllerFindByIdQueryKey,
  returnRefusalOf,
  useAdminReturnControllerReduceCredit,
  type AdminReturnResponseEnvelope,
  type ReturnEntity,
} from "@/entities/return";
import {
  getAdminOrderControllerFindAllQueryKey,
  getAdminOrderControllerFindByIdQueryKey,
  getAdminOrderControllerGetHistoryQueryKey,
  getAdminOrderMoneyControllerGetQueryKey,
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
  Textarea,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { formatKop, kopToInput, parseKop } from "@/shared/lib";
import { checkReduceReason, checkReducedCredit } from "../model/reduce-credit";

const r = dict.returnMoney;
const m = dict.orderMoney;

/** Same ceiling as `ReduceReturnCreditDto.reason` (`@MaxLength(500)`). */
const REASON_MAX_LENGTH = 500;

interface ReduceCreditActionProps {
  rma: Pick<ReturnEntity, "id" | "orderId">;
  /** «До повернення» now, kopecks — the server's figure. */
  creditKop: number;
  /** Paid out on this return so far — the floor. */
  paidOutKop: number;
}

/**
 * «Зменшити» «До повернення» (R2, TASK-2046) — `PATCH /admin/returns/:id/credit`.
 *
 * The amount owed back is the returned lines less their promo share, computed
 * by the server when the decision became REFUND. An operator may only LOWER it
 * (a scratch, a missing accessory) and must say why: the reason is kept on the
 * return as `creditReason` and in the action log. Not below what was already
 * paid out — that money has gone; a payout is reversed first.
 *
 * The order's balance and the return's derived status follow on the server, so
 * the return, the order card, its money and the lists are refreshed. A refusal
 * from a stale page (a payout landed, the decision changed) is said and the
 * page re-read.
 *
 * Absent without `returns:write`, and when there is nothing left to lower
 * (everything owed is already paid out).
 */
export function ReduceCreditAction({
  rma,
  creditKop,
  paidOutKop,
}: ReduceCreditActionProps) {
  const { can } = useAuth();
  const [open, setOpen] = useState(false);

  if (!can(PERM.returnsWrite) || creditKop <= paidOutKop) return null;

  return (
    <>
      <Button
        type="button"
        variant="link"
        size="sm"
        className="h-auto p-0"
        aria-label={r.reduceActionAria}
        onClick={() => setOpen(true)}
      >
        {r.reduceAction}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        {open ? (
          <ReduceDialogBody
            rma={rma}
            creditKop={creditKop}
            paidOutKop={paidOutKop}
            onClose={() => setOpen(false)}
          />
        ) : null}
      </Dialog>
    </>
  );
}

function ReduceDialogBody({
  rma,
  creditKop,
  paidOutKop,
  onClose,
}: ReduceCreditActionProps & { onClose: () => void }) {
  const queryClient = useQueryClient();
  const reduce = useAdminReturnControllerReduceCredit();
  const ids = useId();
  // Mount-time snapshot: the decision is taken on the figures it was opened on.
  const [bounds] = useState(() => ({ currentKop: creditKop, paidOutKop }));
  const [rawAmount, setRawAmount] = useState(() =>
    bounds.currentKop > 0 ? kopToInput(bounds.currentKop) : "0",
  );
  const [reason, setReason] = useState("");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const typedKop = parseKop(rawAmount);
  const amountId = `${ids}-amount`;
  const reasonId = `${ids}-reason`;

  const refresh = (fresh: ReturnEntity | null) => {
    const returnKey = getAdminReturnControllerFindByIdQueryKey(rma.id);
    if (fresh) {
      queryClient.setQueryData<AdminReturnResponseEnvelope>(returnKey, {
        data: fresh,
      });
    } else {
      void queryClient.invalidateQueries({ queryKey: returnKey });
    }
    // The credit moves the order's balance (and may make the return REFUNDED,
    // which may make the order REFUNDED) — every screen that shows them.
    for (const queryKey of [
      getAdminReturnControllerFindAllQueryKey(),
      getAdminOrderReturnControllerFindForOrderQueryKey(rma.orderId),
      getAdminOrderMoneyControllerGetQueryKey(rma.orderId),
      getAdminOrderControllerFindByIdQueryKey(rma.orderId),
      getAdminOrderControllerFindAllQueryKey(),
      getAdminOrderControllerGetHistoryQueryKey(rma.orderId),
    ]) {
      void queryClient.invalidateQueries({ queryKey });
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const amount = checkReducedCredit(rawAmount, bounds);
    const why = checkReduceReason(reason);
    setAmountError(amount.ok ? null : amount.message);
    setReasonError(why.ok ? null : why.message);
    if (!amount.ok || !why.ok) return;

    reduce.mutate(
      {
        returnId: rma.id,
        data: { creditKop: amount.kop, reason: why.reason },
      },
      {
        onSuccess: (response) => {
          onClose();
          toast.success(r.reduceToast);
          refresh(response.data);
        },
        onError: (error) => {
          const refusal = returnRefusalOf(error);
          if (refusal?.refetch) {
            // The page was stale — say what moved and re-read it.
            onClose();
            toast.error(refusal.message);
            refresh(null);
            return;
          }
          setFormError(refusal?.message ?? r.reduceFailed);
        },
      },
    );
  };

  return (
    <DialogContent>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle>{r.reduceTitle}</DialogTitle>
          <DialogDescription>
            {r.reduceDescription(
              formatKop(bounds.currentKop),
              formatKop(bounds.paidOutKop),
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={amountId}>{r.reduceAmountLabel}</Label>
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
          <Label htmlFor={reasonId} required>
            {r.reduceReasonLabel}
          </Label>
          <Textarea
            id={reasonId}
            value={reason}
            maxLength={REASON_MAX_LENGTH}
            aria-required="true"
            aria-invalid={reasonError ? true : undefined}
            aria-describedby={
              reasonError ? `${reasonId}-error` : `${reasonId}-hint`
            }
            onChange={(event) => {
              setReason(event.target.value);
              setReasonError(null);
            }}
          />
          <p id={`${reasonId}-hint`} className="text-xs text-muted-foreground">
            {r.reduceReasonHint}
          </p>
          <FieldError id={`${reasonId}-error`}>{reasonError}</FieldError>
        </div>

        <FormAlert>{formError}</FormAlert>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={reduce.isPending}
            onClick={onClose}
          >
            {m.cancel}
          </Button>
          <Button type="submit" disabled={reduce.isPending}>
            {typedKop !== null
              ? r.reduceSubmit(formatKop(typedKop))
              : r.reduceSubmitBare}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
