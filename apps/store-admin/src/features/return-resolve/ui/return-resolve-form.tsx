"use client";

import { useId, useState, type ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "@/shared/ui/toast";
import {
  ReturnEntityStatus,
  allowedReturnTransitions,
  getAdminReturnControllerFindAllQueryKey,
  getAdminReturnControllerFindByIdQueryKey,
  useAdminReturnControllerResolve,
  type ReturnEntity,
} from "@/entities/return";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import {
  Button,
  Checkbox,
  FieldError,
  Input,
  Label,
  Textarea,
  useConfirmDialog,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import {
  apiErrorCode,
  apiErrorMessage,
  apiErrorStatus,
  formatCurrency,
} from "@/shared/lib";
import { cn } from "@/shared/lib/utils";
import {
  OPERATOR_NOTES_MAX_LENGTH,
  canRestock,
  createResolveReturnSchema,
  refundCapOf,
  resolveValuesToDto,
  returnedValueOf,
  type ResolveReturnFormValues,
} from "../model/resolve-schema";

const d = dict.returns;

/** The API's TASK-785 refusal codes, carried in the 400 body's `error`. */
const REFUND_CEILING_MESSAGES: Record<string, () => string> = {
  RETURN_REFUND_EXCEEDS_RETURNED_VALUE: () =>
    d.resolveRefundExceedsReturnedValue(),
  RETURN_REFUND_EXCEEDS_ORDER_BALANCE: () =>
    d.resolveRefundExceedsOrderBalance(),
};

interface ReturnResolveFormProps {
  rma: ReturnEntity;
  /**
   * What the order still has to give back — `order.total` less the other
   * returns' refunds (TASK-959, see `orderBalanceOf`). `null`/absent when the
   * card could not compute it (no `orders:read`); the server still enforces it.
   */
  orderBalance?: string | null;
}

/**
 * «Наступний крок» + «Внутрішні примітки» of a return (TASK-340, wave 198
 * TASK-1056, ReturnsProposal Р3–Р5).
 *
 * One card that offers ONLY what the state machine allows from here, as named
 * actions instead of a status select and one «Зберегти рішення»:
 *
 *   REQUESTED → «Схвалити заявку» · «Відхилити заявку…»
 *   APPROVED  → «Повернути товар на склад (N шт.)» ☑ + «Товар отримано» ·
 *               «Відхилити заявку…»
 *   RECEIVED  → «Сума повернення, ₴ *» + «Гроші повернуто»
 *   REJECTED / REFUNDED → nothing: a communicated decision is not rewritten.
 *
 * Every action is the same `PATCH /admin/returns/:id` the old form sent, behind
 * the same `returns:write` (TASK-716) — a reader sees the step and the notes,
 * and one line saying the return is view-only. Nothing renders while the
 * grant set is loading: `can()` answers false in that window for everyone.
 *
 * Deliberate absences, each of which would otherwise be a control that lies:
 *  - The amount appears only on the refund step (§6 of the problems list).
 *    Its value is still carried on the other steps, so moving an old return
 *    along never clears an amount recorded earlier.
 *  - No refund button that moves money: «Гроші повернуто» records an amount;
 *    the provider-side refund lives with the payment. The artboard's «Переказом
 *    / готівкою · Через LiqPay» is not drawn — the API stores no refund method
 *    (TASK-1056's API tail, TASK-951).
 *  - Restock is offered only at «Товар отримано» and only once; ticked by
 *    default since wave 198 (most parcels come back sellable — «Зніміть, якщо…»).
 *
 * The notes are shown ONCE (they were on the card twice); «Змінити» turns them
 * into a field that is saved with the next step — the API has no notes-only
 * write, so on a closed return there is no «Змінити».
 */
export function ReturnResolveForm({
  rma,
  orderBalance,
}: ReturnResolveFormProps) {
  const { can, arePermissionsLoading } = useAuth();
  if (arePermissionsLoading) return null;
  if (!can(PERM.returnsWrite)) {
    return (
      <div className="flex flex-col gap-6">
        <StepCard>
          <p className="text-sm text-muted-foreground">
            {dict.common.viewOnly}
          </p>
        </StepCard>
        <NotesCard notes={rma.operatorNotes ?? null} />
      </div>
    );
  }
  return <ReturnResolveEditor rma={rma} orderBalance={orderBalance} />;
}

/* ── Cards ──────────────────────────────────────────────────────────────── */

function StepCard({
  children,
  active = false,
}: {
  children: ReactNode;
  active?: boolean;
}) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-card",
        active && "border-primary/40",
      )}
    >
      <h3 id={headingId} className="text-sm font-semibold text-foreground">
        {d.resolveHeading}
      </h3>
      {children}
    </section>
  );
}

function NotesCard({
  notes,
  onEdit,
  editor,
}: {
  notes: string | null;
  /** Present when the notes can be changed (a writer, a return still open). */
  onEdit?: () => void;
  /** The field, while editing. */
  editor?: ReactNode;
}) {
  // A plain section, not a labelled region: the field inside is labelled
  // «Внутрішні примітки» too, and two controls with one name is one too many.
  return (
    <section className="flex flex-col gap-2 rounded-lg border bg-card p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">
          {d.operatorNotes}
        </h3>
        {onEdit && !editor ? (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0"
            onClick={onEdit}
          >
            {d.notesEdit}
          </Button>
        ) : null}
      </div>
      {editor ?? (
        <>
          <p
            className={cn(
              "text-sm break-words whitespace-pre-line",
              notes ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {notes ?? d.notesEmpty}
          </p>
          <p className="text-xs text-muted-foreground">{d.operatorNotesHint}</p>
        </>
      )}
    </section>
  );
}

/* ── Editor ─────────────────────────────────────────────────────────────── */

function ReturnResolveEditor({ rma, orderBalance }: ReturnResolveFormProps) {
  const queryClient = useQueryClient();
  const resolve = useAdminReturnControllerResolve();
  const { confirm, confirmDialog } = useConfirmDialog();
  const [editingNotes, setEditingNotes] = useState(false);

  const allowed = allowedReturnTransitions(rma.status);
  const returnedValue = returnedValueOf(rma.items);
  // The hint names a maximum only when the card knows BOTH ceilings — the
  // same rule as «Можна повернути максимум» beside it; the returned value
  // alone may overstate what the order has left.
  const cap =
    orderBalance != null ? refundCapOf({ returnedValue, orderBalance }) : null;
  const units = rma.items.reduce((sum, item) => sum + item.quantity, 0);

  const form = useForm<ResolveReturnFormValues>({
    // TASK-785 / TASK-959: both API ceilings, as far as this card knows them.
    resolver: zodResolver(
      createResolveReturnSchema({ returnedValue, orderBalance }),
    ),
    // forms.md Rule 2a — the entity id is stable for the life of this page, and
    // `keepDirtyValues` protects a half-written note from a background refetch.
    values: {
      status: "",
      operatorNotes: rma.operatorNotes ?? "",
      refundedAmount: rma.refundedAmount ?? "",
      restock: rma.restockedAt === null,
    },
    resetOptions: { keepDirtyValues: true },
  });

  // `useWatch` rather than `form.watch`: the latter returns a fresh function the
  // React Compiler cannot memoize.
  const restock = useWatch({ control: form.control, name: "restock" });
  const { errors } = form.formState;

  const pendingStatus = resolve.isPending ? resolve.variables?.data.status : "";

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
          setEditingNotes(false);
          toast.success(d.resolveSuccess);
        },
        onError: (error) => {
          const status = apiErrorStatus(error);
          if (status === 409) {
            // The server's state machine is authoritative — the client-side
            // mirror losing to it is exactly the drift its docblock warns
            // about, so refetch and say so plainly.
            void queryClient.invalidateQueries({
              queryKey: getAdminReturnControllerFindByIdQueryKey(rma.id),
            });
            toast.error(d.resolveConflict);
            return;
          }
          if (status === 400) {
            const code = apiErrorCode(error);
            const ceiling =
              typeof code === "string"
                ? REFUND_CEILING_MESSAGES[code]
                : undefined;
            if (ceiling) {
              // Under the amount, not in a toast: that number is what is wrong.
              form.setError(
                "refundedAmount",
                { type: "server", message: ceiling() },
                { shouldFocus: true },
              );
              return;
            }
            // TASK-956: a DTO refusal names its field — put it under that
            // field. Anything else gets a sentence that is true.
            const message = apiErrorMessage(error) ?? "";
            if (/operatorNotes/.test(message)) {
              setEditingNotes(true);
              form.setError("operatorNotes", {
                type: "server",
                message: d.operatorNotesTooLong,
              });
              return;
            }
            if (/refundedAmount/.test(message)) {
              form.setError(
                "refundedAmount",
                { type: "server", message: d.resolveRefundedAmountInvalid },
                { shouldFocus: true },
              );
              return;
            }
            toast.error(d.resolveBadRequest);
            return;
          }
          toast.error(d.resolveFailed);
        },
      },
    );
  };

  const submitStep = (status: string) => {
    if (resolve.isPending) return;
    form.clearErrors();
    form.setValue("status", status, { shouldDirty: true });
    if (
      status === ReturnEntityStatus.REFUNDED &&
      form.getValues("refundedAmount").trim() === ""
    ) {
      // «Гроші повернуто» without a sum records nothing anyone can check.
      form.setError(
        "refundedAmount",
        { type: "required", message: d.resolveRefundedAmountRequired },
        { shouldFocus: true },
      );
      return;
    }
    void form.handleSubmit(onSubmit, (fieldErrors) => {
      // A note refused by the schema is only visible in its editor.
      if (fieldErrors.operatorNotes) setEditingNotes(true);
    })();
  };

  const askReject = async () => {
    const confirmed = await confirm({
      title: d.rejectConfirmTitle,
      description: d.rejectConfirmDescription,
      confirmLabel: d.rejectConfirm,
      destructive: true,
    });
    if (confirmed) submitStep(ReturnEntityStatus.REJECTED);
  };

  const actionButton = (status: string, label: string) => {
    const busy = pendingStatus === status;
    return (
      <Button
        type="button"
        className="w-full"
        disabled={resolve.isPending}
        aria-busy={busy || undefined}
        onClick={() => submitStep(status)}
      >
        {busy ? (
          <>
            <Loader2
              aria-hidden="true"
              className="animate-spin motion-reduce:animate-none"
            />
            {d.saving}
          </>
        ) : (
          label
        )}
      </Button>
    );
  };

  const rejectButton = allowed.includes(ReturnEntityStatus.REJECTED) ? (
    <Button
      type="button"
      variant="ghost"
      className="w-full text-destructive hover:text-destructive"
      disabled={resolve.isPending}
      onClick={() => void askReject()}
    >
      {pendingStatus === ReturnEntityStatus.REJECTED ? (
        <>
          <Loader2
            aria-hidden="true"
            className="animate-spin motion-reduce:animate-none"
          />
          {d.saving}
        </>
      ) : (
        d.reject
      )}
    </Button>
  ) : null;

  const amountError = errors.refundedAmount?.message;
  const notesError = errors.operatorNotes?.message;

  let step: ReactNode;
  if (allowed.length === 0) {
    step = (
      <p className="text-sm text-muted-foreground">{d.resolveNoTransitions}</p>
    );
  } else if (rma.status === ReturnEntityStatus.REQUESTED) {
    step = (
      <>
        <p className="text-sm text-muted-foreground">{d.nextRequested}</p>
        {actionButton(ReturnEntityStatus.APPROVED, d.approve)}
        {rejectButton}
      </>
    );
  } else if (rma.status === ReturnEntityStatus.APPROVED) {
    const restockAvailable = canRestock(
      ReturnEntityStatus.RECEIVED,
      rma.restockedAt,
    );
    step = (
      <>
        <p className="text-sm text-muted-foreground">{d.nextApproved}</p>
        {restockAvailable ? (
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-2">
              <Checkbox
                id="return-restock"
                checked={restock}
                onCheckedChange={(checked) =>
                  form.setValue("restock", checked === true, {
                    shouldDirty: true,
                  })
                }
                aria-describedby="return-restock-hint"
              />
              <Label htmlFor="return-restock">{d.restockUnits(units)}</Label>
            </span>
            <p
              id="return-restock-hint"
              className="pl-6 text-xs text-muted-foreground"
            >
              {d.resolveRestockHint}
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {d.resolveRestockAlreadyDone}
          </p>
        )}
        {actionButton(ReturnEntityStatus.RECEIVED, d.markReceived)}
        {rejectButton}
      </>
    );
  } else {
    // RECEIVED — the only move left is the money.
    step = (
      <>
        <p className="text-sm text-muted-foreground">
          {d.nextReceived(rma.restockedAt !== null)}
        </p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="return-refunded-amount" required>
            {d.resolveRefundedAmount}
          </Label>
          <Input
            id="return-refunded-amount"
            inputMode="decimal"
            autoComplete="off"
            required
            placeholder={d.resolveRefundedAmountPlaceholder}
            aria-describedby={
              amountError
                ? "return-refunded-amount-error"
                : "return-refunded-amount-hint"
            }
            aria-invalid={amountError ? true : undefined}
            {...form.register("refundedAmount")}
            // The form has no submit button (each step is its own action), so
            // Enter in the step's only text field must do the step itself.
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              submitStep(ReturnEntityStatus.REFUNDED);
            }}
          />
          {amountError ? (
            <FieldError id="return-refunded-amount-error" className="text-xs">
              {amountError}
            </FieldError>
          ) : (
            <p
              id="return-refunded-amount-hint"
              className="text-xs text-muted-foreground"
            >
              {cap === null
                ? d.resolveRefundedAmountHint
                : d.refundCapHint(formatCurrency(cap))}
            </p>
          )}
        </div>
        {actionButton(ReturnEntityStatus.REFUNDED, d.markRefunded)}
      </>
    );
  }

  const canEditNotes = allowed.length > 0;

  return (
    <form
      onSubmit={(event) => event.preventDefault()}
      className="flex flex-col gap-6"
      noValidate
    >
      <StepCard active={allowed.length > 0}>{step}</StepCard>
      <NotesCard
        notes={rma.operatorNotes ?? null}
        onEdit={canEditNotes ? () => setEditingNotes(true) : undefined}
        editor={
          canEditNotes && editingNotes ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="return-operator-notes" className="sr-only">
                {d.operatorNotes}
              </Label>
              {/* TASK-794: the DTO's limit, stopped at the keyboard and
                  explained if it is ever reached another way. */}
              <Textarea
                id="return-operator-notes"
                rows={3}
                maxLength={OPERATOR_NOTES_MAX_LENGTH}
                placeholder={d.operatorNotesPlaceholder}
                aria-describedby={
                  notesError
                    ? "return-operator-notes-error"
                    : "return-operator-notes-hint"
                }
                aria-invalid={notesError ? true : undefined}
                {...form.register("operatorNotes")}
              />
              {notesError ? (
                <FieldError
                  id="return-operator-notes-error"
                  className="text-xs"
                >
                  {notesError}
                </FieldError>
              ) : (
                <p
                  id="return-operator-notes-hint"
                  className="text-xs text-muted-foreground"
                >
                  {d.notesEditHint}
                </p>
              )}
            </div>
          ) : undefined
        }
      />
      {confirmDialog}
    </form>
  );
}
