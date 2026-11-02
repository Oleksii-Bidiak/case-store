"use client";

import { useId, useState, type ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "@/shared/ui/toast";
import {
  RETURN_ERROR_CODE,
  ReturnDecision,
  ReturnEntityStatus,
  getAdminReturnControllerFindAllQueryKey,
  getAdminReturnControllerFindByIdQueryKey,
  nextResolveStep,
  returnDecisionLabel,
  returnRefusalOf,
  useAdminReturnControllerResolve,
  type ReturnEntity,
} from "@/entities/return";
import {
  getAdminOrderControllerFindByIdQueryKey,
  getAdminOrderMoneyControllerGetQueryKey,
} from "@/entities/order";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import { Button, Checkbox, FieldError, Label, Textarea } from "@/shared/ui";
import { dict } from "@/shared/config";
import { apiErrorMessage, apiErrorStatus } from "@/shared/lib";
import { cn } from "@/shared/lib/utils";
import {
  OPERATOR_NOTES_MAX_LENGTH,
  canRestock,
  notesOnlyDto,
  resolveReturnSchema,
  resolveValuesToDto,
  type ResolveReturnFormValues,
} from "../model/resolve-schema";

const d = dict.returns;

interface ReturnResolveFormProps {
  rma: ReturnEntity;
  /**
   * The return's money card (R2, TASK-2046), composed by the page: drawn
   * between «Наступний крок» and the notes, because on a received REFUND return
   * the next step IS the payout. Another feature's UI, so it arrives as a node.
   */
  money?: ReactNode;
}

/**
 * «Наступний крок» + «Внутрішні примітки» of a return (TASK-340, wave 198
 * TASK-1056, ReturnsProposal Р3–Р5).
 *
 * One card that offers ONLY what is still a manual step from here:
 *
 *   REQUESTED → nothing yet: the decision comes first
 *   APPROVED  → «Повернути товар на склад (N шт.)» ☑ + «Товар отримано»
 *   RECEIVED  → nothing to press here. Under a REFUND decision the money goes
 *               out from the money card (`money`), payout by payout; a repair
 *               or a replacement returns no money
 *   REJECTED  → nothing: re-opening a refusal is a change of the decision
 *   REFUNDED  → nothing: it follows from the payouts.
 *
 * Since B-12 (TASK-2044) APPROVED and REJECTED are decisions
 * (`features/return-decide`); since R2 (TASK-2046) REFUNDED is derived from
 * the order money ledger — the old «Сума повернення» + «Гроші повернуто»
 * recorded a figure no other screen saw, and two of them could exceed what was
 * paid (TASK-951). The PATCH refuses both (`RETURN_USE_DECISION_ENDPOINT`,
 * `RETURN_REFUND_DERIVED`).
 *
 * Every action is `PATCH /admin/returns/:id` behind `returns:write`
 * (TASK-716) — a reader sees the step and the notes, and one line saying the
 * return is view-only. Nothing renders while the grant set is loading.
 *
 * The notes are shown ONCE; «Змінити» turns them into a field with its own
 * «Зберегти примітки» — a PATCH without a status, which the API applies on ANY
 * status with no transition. Where a step exists, the notes go with it too.
 */
export function ReturnResolveForm({ rma, money }: ReturnResolveFormProps) {
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
        {money}
        <NotesCard notes={rma.operatorNotes ?? null} />
      </div>
    );
  }
  return <ReturnResolveEditor rma={rma} money={money} />;
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

function ReturnResolveEditor({ rma, money }: ReturnResolveFormProps) {
  const queryClient = useQueryClient();
  const resolve = useAdminReturnControllerResolve();
  const [editingNotes, setEditingNotes] = useState(false);

  const next = nextResolveStep(rma.status);
  const units = rma.items.reduce((sum, item) => sum + item.quantity, 0);

  const form = useForm<ResolveReturnFormValues>({
    resolver: zodResolver(resolveReturnSchema),
    // forms.md Rule 2a — the entity id is stable for the life of this page, and
    // `keepDirtyValues` protects a half-written note from a background refetch.
    values: {
      status: "",
      operatorNotes: rma.operatorNotes ?? "",
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
    // «Товар отримано» moves the order too (restock, recompute → new
    // updatedAt): the money card must not pay out with the stale one (TASK-2350).
    void queryClient.invalidateQueries({
      queryKey: getAdminOrderMoneyControllerGetQueryKey(rma.orderId),
    });
    void queryClient.invalidateQueries({
      queryKey: getAdminOrderControllerFindByIdQueryKey(rma.orderId),
    });
  };

  /** One reading of a refused PATCH, for a step and for the notes alike. */
  const onResolveError = (error: unknown, fallback: string) => {
    const status = apiErrorStatus(error);
    const refusal = returnRefusalOf(error);
    if (status === 409 || refusal?.refetch) {
      // The server's state machine is authoritative — refetch and say so
      // plainly. A coded refusal names what moved (TASK-1966); a bare
      // transition refusal keeps the old line.
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
    // The step not chosen is not part of this write — only the notes have to
    // be valid.
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

  const notesError = errors.operatorNotes?.message;

  let step: ReactNode;
  if (rma.status === ReturnEntityStatus.REQUESTED) {
    step = <p className="text-sm text-muted-foreground">{d.nextRequested}</p>;
  } else if (rma.status === ReturnEntityStatus.REJECTED) {
    step = <p className="text-sm text-muted-foreground">{d.nextRejected}</p>;
  } else if (
    rma.status === ReturnEntityStatus.RECEIVED &&
    rma.decision === ReturnDecision.REFUND
  ) {
    // The goods are here; what is left is money — on the money card below.
    step = (
      <p className="text-sm text-muted-foreground">
        {d.nextReceived(rma.restockedAt !== null)}
      </p>
    );
  } else if (rma.status === ReturnEntityStatus.RECEIVED) {
    // A repair or a replacement: the goods are here, no money goes back.
    step = (
      <p className="text-sm text-muted-foreground">
        {d.nextReceivedNoRefund(
          rma.decision === null ? null : returnDecisionLabel(rma.decision),
        )}
      </p>
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
    step = (
      <p className="text-sm text-muted-foreground">{d.resolveNoTransitions}</p>
    );
  }

  return (
    <form
      onSubmit={(event) => event.preventDefault()}
      className="flex flex-col gap-6"
      noValidate
    >
      <StepCard active={next !== null}>{step}</StepCard>
      {money}
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
