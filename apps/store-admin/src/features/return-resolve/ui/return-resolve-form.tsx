"use client";

import { useId, useState, type ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "@/shared/ui/toast";
import {
  RETURN_ERROR_CODE,
  ReturnEntityStatus,
  getAdminReturnControllerFindAllQueryKey,
  getAdminReturnControllerFindByIdQueryKey,
  nextResolveStep,
  returnDecisionLabel,
  returnRefusalOf,
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
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { apiErrorMessage, apiErrorStatus, formatCurrency } from "@/shared/lib";
import { cn } from "@/shared/lib/utils";
import {
  OPERATOR_NOTES_MAX_LENGTH,
  canRestock,
  createResolveReturnSchema,
  notesOnlyDto,
  refundCapOf,
  resolveValuesToDto,
  returnedValueOf,
  type ResolveReturnFormValues,
} from "../model/resolve-schema";

const d = dict.returns;

/**
 * The API's TASK-785 refusal codes — both go under the amount, since that
 * number is what is wrong. Worded by the shared `returnRefusalOf` (TASK-1966).
 */
const REFUND_CEILING_CODES: ReadonlyArray<string | null> = [
  RETURN_ERROR_CODE.REFUND_EXCEEDS_RETURNED_VALUE,
  RETURN_ERROR_CODE.REFUND_EXCEEDS_ORDER_BALANCE,
];

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
 *   REQUESTED → nothing yet: the decision comes first
 *   APPROVED  → «Повернути товар на склад (N шт.)» ☑ + «Товар отримано»
 *   RECEIVED  → «Сума повернення, ₴ *» + «Гроші повернуто» — under a REFUND
 *               decision only; a repair or a replacement returns no money
 *   REJECTED  → nothing: re-opening a refusal is a change of the decision
 *   REFUNDED  → nothing: the return is closed.
 *
 * Since B-12 (TASK-2044) «Схвалити / Відхилити…» are gone from here: APPROVED
 * and REJECTED follow from a decision (`features/return-decide`), and this
 * PATCH refuses them (`RETURN_USE_DECISION_ENDPOINT`).
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
 * into a field with its own «Зберегти примітки» — a PATCH without a status,
 * which the API applies on ANY status with no transition. Since approving and
 * refusing became decisions, a REQUESTED or REJECTED return has no step for
 * the notes to ride on. Where a step exists, the notes still go with it too.
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
  /** Present when the notes can be changed — for a writer, on any status. */
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
  const [editingNotes, setEditingNotes] = useState(false);

  const next = nextResolveStep(rma.status, rma.decision);
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
  // A notes-only PATCH carries no status at all.
  const savingNotes =
    resolve.isPending && resolve.variables?.data.status === undefined;

  const invalidateReturn = () => {
    void queryClient.invalidateQueries({
      queryKey: getAdminReturnControllerFindByIdQueryKey(rma.id),
    });
    void queryClient.invalidateQueries({
      queryKey: getAdminReturnControllerFindAllQueryKey(),
    });
  };

  /** One reading of a refused PATCH, for a step and for the notes alike. */
  const onResolveError = (error: unknown, fallback: string) => {
    const status = apiErrorStatus(error);
    const refusal = returnRefusalOf(error);
    if (refusal && REFUND_CEILING_CODES.includes(refusal.code)) {
      // Under the amount, not in a toast: that number is what is wrong.
      form.setError(
        "refundedAmount",
        { type: "server", message: refusal.message },
        { shouldFocus: true },
      );
      return;
    }
    if (status === 409 || refusal?.refetch) {
      // The server's state machine is authoritative — the client-side
      // mirror losing to it is exactly the drift its docblock warns
      // about, so refetch and say so plainly. A coded refusal names what
      // moved (TASK-1966); a bare transition refusal keeps the old line.
      void queryClient.invalidateQueries({
        queryKey: getAdminReturnControllerFindByIdQueryKey(rma.id),
      });
      toast.error(
        refusal && refusal.code !== RETURN_ERROR_CODE.TRANSITION_INVALID
          ? refusal.message
          : d.resolveConflict,
      );
      return;
    }
    if (refusal) {
      // A 403, or a coded 400 the form cannot place under a field.
      toast.error(refusal.message);
      return;
    }
    if (status === 400) {
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
    toast.error(fallback);
  };

  const onSubmit = (values: ResolveReturnFormValues) => {
    resolve.mutate(
      {
        returnId: rma.id,
        data: resolveValuesToDto(values, rma.restockedAt),
      },
      {
        onSuccess: () => {
          invalidateReturn();
          form.setValue("status", "", { shouldDirty: false });
          setEditingNotes(false);
          toast.success(d.resolveSuccess);
        },
        onError: (error) => onResolveError(error, d.resolveFailed),
      },
    );
  };

  const saveNotes = async () => {
    if (resolve.isPending) return;
    form.clearErrors();
    // The schema's other fields (the step not chosen, the amount) are not
    // part of this write — only the notes have to be valid.
    if (!(await form.trigger("operatorNotes"))) return;
    const notes = form.getValues("operatorNotes");
    resolve.mutate(
      { returnId: rma.id, data: notesOnlyDto(notes) },
      {
        onSuccess: () => {
          invalidateReturn();
          // Saved, so no longer dirty: the refetch may now refill the field.
          form.resetField("operatorNotes", { defaultValue: notes.trim() });
          setEditingNotes(false);
          toast.success(d.notesSaved);
        },
        onError: (error) => onResolveError(error, d.notesSaveFailed),
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

  const amountError = errors.refundedAmount?.message;
  const notesError = errors.operatorNotes?.message;

  let step: ReactNode;
  if (rma.status === ReturnEntityStatus.REQUESTED) {
    step = <p className="text-sm text-muted-foreground">{d.nextRequested}</p>;
  } else if (rma.status === ReturnEntityStatus.REJECTED) {
    step = <p className="text-sm text-muted-foreground">{d.nextRejected}</p>;
  } else if (rma.status === ReturnEntityStatus.RECEIVED && next === null) {
    // A repair or a replacement: the goods are here, no money goes back.
    step = (
      <p className="text-sm text-muted-foreground">
        {d.nextReceivedNoRefund(
          rma.decision === null ? null : returnDecisionLabel(rma.decision),
        )}
      </p>
    );
  } else if (next === null) {
    step = (
      <p className="text-sm text-muted-foreground">{d.resolveNoTransitions}</p>
    );
  } else if (next === ReturnEntityStatus.RECEIVED) {
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
      </>
    );
  } else {
    // RECEIVED under a REFUND decision — the only move left is the money.
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

  return (
    <form
      onSubmit={(event) => event.preventDefault()}
      className="flex flex-col gap-6"
      noValidate
    >
      <StepCard active={next !== null}>{step}</StepCard>
      <NotesCard
        notes={rma.operatorNotes ?? null}
        onEdit={() => setEditingNotes(true)}
        editor={
          editingNotes ? (
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
                    : next !== null
                      ? "return-operator-notes-hint"
                      : undefined
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
              ) : next !== null ? (
                // Only where a step exists can the notes also travel with it.
                <p
                  id="return-operator-notes-hint"
                  className="text-xs text-muted-foreground"
                >
                  {d.notesEditHint}
                </p>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                disabled={resolve.isPending}
                aria-busy={savingNotes || undefined}
                onClick={() => void saveNotes()}
              >
                {savingNotes ? (
                  <>
                    <Loader2
                      aria-hidden="true"
                      className="animate-spin motion-reduce:animate-none"
                    />
                    {d.saving}
                  </>
                ) : (
                  d.notesSave
                )}
              </Button>
            </div>
          ) : undefined
        }
      />
    </form>
  );
}
