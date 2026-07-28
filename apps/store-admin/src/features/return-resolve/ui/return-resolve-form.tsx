"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  allowedReturnTransitions,
  getAdminReturnControllerFindAllQueryKey,
  getAdminReturnControllerFindByIdQueryKey,
  returnStatusLabel,
  useAdminReturnControllerResolve,
  type ReturnEntity,
} from "@/entities/return";
import {
  Button,
  Checkbox,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import {
  canRestock,
  resolveReturnSchema,
  resolveValuesToDto,
  type ResolveReturnFormValues,
} from "../model/resolve-schema";

interface ReturnResolveFormProps {
  rma: ReturnEntity;
}

/**
 * Record the operator's decision on a return (TASK-340).
 *
 * Three deliberate absences, each of which would otherwise be a control that
 * lies:
 *
 *  - No status options beyond what the state machine allows, and none at all
 *    once the return is REJECTED or REFUNDED — those are communicated decisions,
 *    and rewriting one in place erases that it happened.
 *  - The restock checkbox appears only when moving to RECEIVED and only while
 *    the goods have not already been credited. "The parcel arrived" and "the
 *    contents are sellable" are different claims, and only the operator can see
 *    which is true.
 *  - No refund button. Money leaving is recorded here as an amount, not
 *    triggered from here — the provider-side refund lives with the payment, and
 *    a button that merely *looks* like it moves money is worse than none.
 */
export function ReturnResolveForm({ rma }: ReturnResolveFormProps) {
  const queryClient = useQueryClient();
  const resolve = useAdminReturnControllerResolve();

  const allowed = allowedReturnTransitions(rma.status);

  const form = useForm<ResolveReturnFormValues>({
    resolver: zodResolver(resolveReturnSchema),
    // forms.md Rule 2a — the entity id is stable for the life of this page, and
    // `keepDirtyValues` protects a half-written note from a background refetch.
    values: {
      status: "",
      operatorNotes: rma.operatorNotes ?? "",
      refundedAmount: rma.refundedAmount ?? "",
      restock: false,
    },
    resetOptions: { keepDirtyValues: true },
  });

  const targetStatus = form.watch("status");
  const restockAvailable = canRestock(targetStatus, rma.restockedAt);

  if (allowed.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {dict.returns.resolveNoTransitions}
      </p>
    );
  }

  const onSubmit = (values: ResolveReturnFormValues) => {
    resolve.mutate(
      {
        returnId: rma.id,
        data: resolveValuesToDto(values, rma.restockedAt),
      },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getAdminReturnControllerFindByIdQueryKey(rma.id),
          });
          void queryClient.invalidateQueries({
            queryKey: getAdminReturnControllerFindAllQueryKey(),
          });
          form.setValue("status", "", { shouldDirty: false });
          form.setValue("restock", false, { shouldDirty: false });
          toast.success(dict.returns.resolveSuccess);
        },
        onError: (error) => {
          const status = (error as { response?: { status?: number } })?.response
            ?.status;
          if (status === 409) {
            // The server's state machine is authoritative — this client-side
            // mirror losing to it is exactly the drift the mirror's docblock
            // warns about, so refetch and say so plainly.
            void queryClient.invalidateQueries({
              queryKey: getAdminReturnControllerFindByIdQueryKey(rma.id),
            });
            toast.error(dict.returns.resolveConflict);
            return;
          }
          if (status === 400) {
            toast.error(dict.returns.resolveBadRequest);
            return;
          }
          toast.error(dict.returns.resolveFailed);
        },
      },
    );
  };

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
      noValidate
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="return-status">{dict.returns.resolveStatus}</Label>
        <Select
          value={targetStatus}
          onValueChange={(value) =>
            form.setValue("status", value, { shouldDirty: true })
          }
        >
          <SelectTrigger
            id="return-status"
            className="w-64"
            aria-label={dict.returns.resolveStatusAria}
          >
            <SelectValue placeholder={dict.returns.resolveStatusPlaceholder} />
          </SelectTrigger>
          <SelectContent>
            {allowed.map((status) => (
              <SelectItem key={status} value={status}>
                {returnStatusLabel(status)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="return-refunded-amount">
          {dict.returns.resolveRefundedAmount}
        </Label>
        <Input
          id="return-refunded-amount"
          inputMode="decimal"
          autoComplete="off"
          placeholder={dict.returns.resolveRefundedAmountPlaceholder}
          aria-describedby="return-refunded-amount-hint"
          aria-invalid={form.formState.errors.refundedAmount ? true : undefined}
          {...form.register("refundedAmount")}
        />
        <p
          id="return-refunded-amount-hint"
          className="text-xs text-muted-foreground"
        >
          {dict.returns.resolveRefundedAmountHint}
        </p>
        {form.formState.errors.refundedAmount ? (
          <p role="alert" className="text-xs text-destructive">
            {form.formState.errors.refundedAmount.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="return-operator-notes">
          {dict.returns.operatorNotes}
        </Label>
        <Textarea
          id="return-operator-notes"
          rows={3}
          placeholder={dict.returns.operatorNotesPlaceholder}
          aria-describedby="return-operator-notes-hint"
          {...form.register("operatorNotes")}
        />
        <p
          id="return-operator-notes-hint"
          className="text-xs text-muted-foreground"
        >
          {dict.returns.operatorNotesHint}
        </p>
      </div>

      {restockAvailable ? (
        <div className="flex flex-col gap-1.5">
          <span className="flex items-center gap-2">
            <Checkbox
              id="return-restock"
              checked={form.watch("restock")}
              onCheckedChange={(checked) =>
                form.setValue("restock", checked === true, {
                  shouldDirty: true,
                })
              }
              aria-describedby="return-restock-hint"
            />
            <Label htmlFor="return-restock">
              {dict.returns.resolveRestock}
            </Label>
          </span>
          <p id="return-restock-hint" className="text-xs text-muted-foreground">
            {dict.returns.resolveRestockHint}
          </p>
        </div>
      ) : rma.restockedAt !== null ? (
        <p className="text-xs text-muted-foreground">
          {dict.returns.resolveRestockAlreadyDone}
        </p>
      ) : null}

      <div>
        <Button
          type="submit"
          size="sm"
          disabled={resolve.isPending || targetStatus === ""}
        >
          {dict.returns.resolveSubmit}
        </Button>
      </div>
    </form>
  );
}
