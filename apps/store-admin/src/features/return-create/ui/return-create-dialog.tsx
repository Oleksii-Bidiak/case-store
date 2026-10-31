"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { formatOrderNumber, type OrderEntity } from "@/entities/order";
import {
  clampQuantity,
  getAdminOrderReturnControllerFindForOrderQueryKey,
  getAdminReturnControllerFindAllQueryKey,
  returnableLines,
  returnOutcomeLabel,
  ReturnOutcome,
  useAdminOrderReturnControllerCreate,
  useAdminOrderReturnControllerFindForOrder,
  type CreateReturnDto,
} from "@/entities/return";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  NumberStepper,
  SegmentedControl,
  Textarea,
} from "@/shared/ui";
import { toast } from "@/shared/ui/toast";
import { dict } from "@/shared/config";
import { apiErrorCode } from "@/shared/lib";

const d = dict.returns;

/** The API caps the reason at 1000 characters (`CreateReturnDto.reason`). */
const COMMENT_MAX_LENGTH = 1000;

/** «Не сказав» — the segmented control needs a value for "no answer". */
const NO_OUTCOME = "";
type OutcomeChoice = ReturnOutcome | typeof NO_OUTCOME;

const OUTCOME_OPTIONS: ReadonlyArray<{ value: OutcomeChoice; label: string }> =
  [
    { value: NO_OUTCOME, label: d.createOutcomeNone },
    { value: ReturnOutcome.REFUND, label: returnOutcomeLabel("REFUND") },
    {
      value: ReturnOutcome.REPLACEMENT,
      label: returnOutcomeLabel("REPLACEMENT"),
    },
    { value: ReturnOutcome.REPAIR, label: returnOutcomeLabel("REPAIR") },
  ];

export type ReturnCreateOrder = Pick<OrderEntity, "id" | "items">;

interface ReturnCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: ReturnCreateOrder;
}

/**
 * «Оформити повернення» — the operator files a return for the buyer, line by
 * line (TASK-1963, B-12 §1).
 *
 * Replaces the side effect of the REFUNDED status, which always claimed the
 * whole order. The status of the order is NOT touched here: creating a request
 * is a record of what the buyer asked for, not a statement that money moved.
 *
 * The form lives in a child of `DialogContent`, which Radix unmounts on close —
 * so every opening starts from a blank form and nothing needs resetting.
 */
export function ReturnCreateDialog({
  open,
  onOpenChange,
  order,
}: ReturnCreateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <ReturnCreateForm order={order} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ReturnCreateForm({
  order,
  onClose,
}: {
  order: ReturnCreateOrder;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  // The list of earlier requests is a READ (`returns:read`); without it the
  // steppers are bounded by what was bought and the server checks the rest.
  const canReadReturns = can(PERM.returnsRead);
  const claims = useAdminOrderReturnControllerFindForOrder(order.id, {
    query: { enabled: canReadReturns },
  });
  const createReturn = useAdminOrderReturnControllerCreate();

  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [outcome, setOutcome] = useState<OutcomeChoice>(NO_OUTCOME);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string } | null>(null);

  const outcomeLabelId = useId();
  const commentId = useId();
  const commentHintId = `${commentId}-hint`;
  const nothingHintId = useId();

  const lines = returnableLines(order.items, claims.data?.data ?? []);
  // Clamped where it is read: the stepper's `max` is advice to the browser.
  const picked = lines
    .map((line) => ({
      orderItemId: line.orderItemId,
      quantity: clampQuantity(
        Number.parseInt(quantities[line.orderItemId] ?? "0", 10),
        line.remaining,
      ),
    }))
    .filter((item) => item.quantity > 0);
  const nothingSelected = picked.length === 0;
  const claimsLoading = canReadReturns && claims.isLoading;

  const orderNumber = formatOrderNumber(order.id);

  if (created) {
    const number = formatOrderNumber(created.id);
    return (
      <>
        <DialogHeader>
          <DialogTitle>{d.createTitle(orderNumber)}</DialogTitle>
          <DialogDescription>{d.createDone}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {d.createClose}
          </Button>
          {/* The request's own page needs `returns:read`; without it the link
              would only lead to a refusal. */}
          {canReadReturns ? (
            <Button asChild>
              <Link href={`/returns/${created.id}`}>
                {d.createOpenReturn(number)}
              </Link>
            </Button>
          ) : null}
        </DialogFooter>
      </>
    );
  }

  const submit = () => {
    if (nothingSelected) return;
    setError(null);
    const trimmed = comment.trim();
    const data: CreateReturnDto = {
      items: picked,
      ...(trimmed ? { reason: trimmed } : {}),
      ...(outcome !== NO_OUTCOME ? { requestedOutcome: outcome } : {}),
    };
    createReturn.mutate(
      { orderId: order.id, data },
      {
        onSuccess: (response) => {
          void queryClient.invalidateQueries({
            queryKey: getAdminOrderReturnControllerFindForOrderQueryKey(
              order.id,
            ),
          });
          void queryClient.invalidateQueries({
            queryKey: getAdminReturnControllerFindAllQueryKey(),
          });
          toast.success(d.createSuccess);
          setCreated({ id: response.data.id });
        },
        onError: (failure) => {
          if (apiErrorCode(failure) === "RETURN_QUANTITY_EXCEEDED") {
            // Somebody else claimed these units meanwhile — re-read the claims
            // so the steppers show what is really left.
            void queryClient.invalidateQueries({
              queryKey: getAdminOrderReturnControllerFindForOrderQueryKey(
                order.id,
              ),
            });
            setError(d.createQuantityExceeded);
            return;
          }
          setError(d.createFailed);
        },
      },
    );
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <DialogHeader>
        <DialogTitle>{d.createTitle(orderNumber)}</DialogTitle>
        <DialogDescription>{d.createDescription}</DialogDescription>
      </DialogHeader>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-foreground">
          {d.createItemsLegend}
        </legend>
        {claimsLoading ? (
          <p className="text-sm text-muted-foreground">{dict.common.loading}</p>
        ) : null}
        {canReadReturns && claims.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {d.createClaimsLoadError}
          </p>
        ) : null}
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {lines.map((line) => {
            const exhausted = line.remaining === 0;
            // After a RETURN_QUANTITY_EXCEEDED refetch the remainder can shrink
            // under a typed value — show what will actually be sent.
            const raw = quantities[line.orderItemId] ?? "0";
            const shown =
              Number.parseInt(raw, 10) > line.remaining
                ? String(line.remaining)
                : raw;
            return (
              <li
                key={line.orderItemId}
                className="flex flex-wrap items-center justify-between gap-3 p-3"
              >
                <div className="flex min-w-0 flex-col">
                  <span
                    className={
                      exhausted
                        ? "text-sm text-muted-foreground"
                        : "text-sm font-medium text-foreground"
                    }
                  >
                    {line.productName}
                  </span>
                  {exhausted ? null : (
                    <span className="text-xs text-muted-foreground">
                      {d.createRemaining(line.remaining, line.ordered)}
                    </span>
                  )}
                </div>
                {exhausted ? (
                  <Badge variant="secondary">{d.createAlreadyClaimed}</Badge>
                ) : (
                  <NumberStepper
                    value={shown}
                    onChange={(value) =>
                      setQuantities((current) => ({
                        ...current,
                        [line.orderItemId]: value,
                      }))
                    }
                    min={0}
                    max={line.remaining}
                    disabled={claimsLoading || createReturn.isPending}
                    aria-label={d.createQuantityAria(line.productName)}
                    decreaseLabel={d.createDecrease(line.productName)}
                    increaseLabel={d.createIncrease(line.productName)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </fieldset>

      <div className="flex flex-col gap-2">
        <span
          id={outcomeLabelId}
          className="text-sm font-medium text-foreground"
        >
          {d.requestedOutcome}
        </span>
        <SegmentedControl
          aria-labelledby={outcomeLabelId}
          value={outcome}
          onValueChange={setOutcome}
          options={OUTCOME_OPTIONS}
          variant="pill"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={commentId}>{d.reasonOperator}</Label>
        <Textarea
          id={commentId}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder={d.createCommentPlaceholder}
          maxLength={COMMENT_MAX_LENGTH}
          aria-describedby={commentHintId}
          rows={3}
        />
        <p id={commentHintId} className="text-xs text-muted-foreground">
          {d.createCommentHint}
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <DialogFooter className="items-center">
        {nothingSelected ? (
          <p
            id={nothingHintId}
            className="text-sm text-muted-foreground sm:mr-auto"
          >
            {d.createNothingSelected}
          </p>
        ) : null}
        <Button type="button" variant="outline" onClick={onClose}>
          {dict.common.cancel}
        </Button>
        <Button
          type="submit"
          disabled={nothingSelected || createReturn.isPending}
          aria-describedby={nothingSelected ? nothingHintId : undefined}
        >
          {d.createSubmit}
        </Button>
      </DialogFooter>
    </form>
  );
}
