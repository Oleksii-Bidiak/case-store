"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "@/shared/ui/toast";
import {
  availableDecisions,
  getAdminOrderReturnControllerFindForOrderQueryKey,
  getAdminReturnControllerFindAllQueryKey,
  getAdminReturnControllerFindByIdQueryKey,
  returnDecisionLabel,
  useAdminReturnControllerDecide,
  type ReturnEntity,
} from "@/entities/return";
import {
  getAdminOrderControllerFindByIdQueryKey,
  getAdminOrderMoneyControllerGetQueryKey,
} from "@/entities/order";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import {
  Button,
  FieldError,
  Label,
  RadioCard,
  RadioCardGroup,
  Textarea,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { decideErrorOf } from "../model/decide-error";
import {
  DECISION_REASON_MAX_LENGTH,
  createDecideSchema,
  decideValuesToDto,
  type DecideFormValues,
} from "../model/decide-schema";

const d = dict.returns;

interface ReturnDecideFormProps {
  rma: ReturnEntity;
}

/**
 * «Ухвалити / Змінити рішення» on a return (TASK-1961, TASK-2044; B-12 §1.1):
 * «Гроші / Заміна / Ремонт / Відмова» and a reason the customer sees.
 *
 * Replaces the «Схвалити / Відхилити…» buttons of the resolve card, which
 * PATCHed a bare status: the API now sets APPROVED and REJECTED only from a
 * decision, with its author, date and history. Rendered inline — the caller
 * puts it in the «Рішення» card under the current decision.
 *
 * - Behind `returns:write`; nothing while the grant set loads (`can()` answers
 *   false in that window for everyone).
 * - Gone on a REFUNDED return: the decision is locked once money went back.
 * - Folded behind «Змінити рішення…» while a decision stands, so the card reads
 *   as a fact first and an editor second.
 * - The reason rule (zod) mirrors the API: required on «Відмова» and on any
 *   change; its hint «Бачить покупець» is visible text, not a tooltip.
 */
export function ReturnDecideForm({ rma }: ReturnDecideFormProps) {
  const { can, arePermissionsLoading } = useAuth();
  if (arePermissionsLoading || !can(PERM.returnsWrite)) return null;
  if (availableDecisions(rma.status).length === 0) return null;
  return <ReturnDecideEditor rma={rma} />;
}

function ReturnDecideEditor({ rma }: ReturnDecideFormProps) {
  const queryClient = useQueryClient();
  const decide = useAdminReturnControllerDecide();
  const hasDecision = rma.decision !== null;
  const [open, setOpen] = useState(!hasDecision);
  const headingId = useId();
  const groupLabelId = useId();
  const reasonId = useId();
  const reasonHintId = `${reasonId}-hint`;
  const reasonErrorId = `${reasonId}-error`;
  const decisionErrorId = `${groupLabelId}-error`;
  const reasonRef = useRef<HTMLTextAreaElement | null>(null);
  const focusReasonOnOpen = useRef(false);

  const form = useForm<DecideFormValues>({
    resolver: zodResolver(
      createDecideSchema({
        currentDecision: rma.decision,
        currentReason: rma.decisionReason,
      }),
    ),
    // forms.md Rule 2a — the entity id is stable for the life of this page, and
    // `keepDirtyValues` keeps a half-written reason through a background refetch.
    values: { decision: rma.decision ?? "", reason: "" },
    resetOptions: { keepDirtyValues: true },
  });
  const decision = useWatch({ control: form.control, name: "decision" });
  const { errors, isSubmitted } = form.formState;

  // «Змінити рішення…» lands in the reason: a change is not saved without one.
  useEffect(() => {
    if (open && focusReasonOnOpen.current) {
      focusReasonOnOpen.current = false;
      reasonRef.current?.focus();
    }
  }, [open]);

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        className="w-full"
        aria-expanded={false}
        onClick={() => {
          focusReasonOnOpen.current = true;
          setOpen(true);
        }}
      >
        {d.decideOpen}
      </Button>
    );
  }

  const onSubmit = (values: DecideFormValues) => {
    decide.mutate(
      { returnId: rma.id, data: decideValuesToDto(values) },
      {
        onSuccess: (response) => {
          void queryClient.invalidateQueries({
            queryKey: getAdminReturnControllerFindByIdQueryKey(rma.id),
          });
          void queryClient.invalidateQueries({
            queryKey: getAdminReturnControllerFindAllQueryKey(),
          });
          void queryClient.invalidateQueries({
            queryKey: getAdminOrderReturnControllerFindForOrderQueryKey(
              rma.orderId,
            ),
          });
          // A REFUND decision sets the return's credit and recomputes the
          // order (new updatedAt): a payout from the stale journal would 409.
          void queryClient.invalidateQueries({
            queryKey: getAdminOrderMoneyControllerGetQueryKey(rma.orderId),
          });
          void queryClient.invalidateQueries({
            queryKey: getAdminOrderControllerFindByIdQueryKey(rma.orderId),
          });
          form.reset({
            decision: response.data.decision ?? values.decision,
            reason: "",
          });
          setOpen(false);
          toast.success(d.decideSuccess);
        },
        onError: (error) => {
          const outcome = decideErrorOf(error);
          if (outcome.kind === "field") {
            form.setError(
              outcome.field,
              { type: "server", message: outcome.message },
              { shouldFocus: true },
            );
            return;
          }
          if (outcome.refetch) {
            void queryClient.invalidateQueries({
              queryKey: getAdminReturnControllerFindByIdQueryKey(rma.id),
            });
          }
          toast.error(outcome.message);
        },
      },
    );
  };

  const reasonError = errors.reason?.message;
  const decisionError = errors.decision?.message;
  const { ref: registerReasonRef, ...reasonField } = form.register("reason");

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h4 id={headingId} className="text-sm font-semibold text-foreground">
        {d.decideHeading(hasDecision)}
      </h4>
      <form
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          if (decide.isPending) {
            event.preventDefault();
            return;
          }
          void form.handleSubmit(onSubmit)(event);
        }}
      >
        <div className="flex flex-col gap-1.5">
          <span id={groupLabelId} className="sr-only">
            {d.decisionHeading}
          </span>
          <RadioCardGroup
            aria-labelledby={groupLabelId}
            aria-describedby={decisionError ? decisionErrorId : undefined}
            aria-invalid={decisionError ? true : undefined}
            className="grid-cols-2"
            value={decision}
            onValueChange={(next) =>
              // forms.md Rule 4a — a value set from code re-validates itself,
              // but only once a submit has armed the messages.
              form.setValue("decision", next, {
                shouldDirty: true,
                shouldValidate: isSubmitted,
              })
            }
          >
            {availableDecisions(rma.status).map((value) => (
              <RadioCard
                key={value}
                value={value}
                title={returnDecisionLabel(value)}
              />
            ))}
          </RadioCardGroup>
          {decisionError ? (
            <FieldError id={decisionErrorId} className="text-xs">
              {decisionError}
            </FieldError>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={reasonId}>{d.decideReason}</Label>
          <Textarea
            id={reasonId}
            rows={3}
            maxLength={DECISION_REASON_MAX_LENGTH}
            placeholder={d.decideReasonPlaceholder}
            aria-describedby={
              reasonError ? `${reasonErrorId} ${reasonHintId}` : reasonHintId
            }
            aria-invalid={reasonError ? true : undefined}
            {...reasonField}
            ref={(element) => {
              registerReasonRef(element);
              reasonRef.current = element;
            }}
          />
          {reasonError ? (
            <FieldError id={reasonErrorId} className="text-xs">
              {reasonError}
            </FieldError>
          ) : null}
          <p id={reasonHintId} className="text-xs text-muted-foreground">
            {d.decideReasonHint}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Button
            type="submit"
            className="w-full"
            disabled={decide.isPending}
            aria-busy={decide.isPending || undefined}
          >
            {decide.isPending ? (
              <>
                <Loader2
                  aria-hidden="true"
                  className="animate-spin motion-reduce:animate-none"
                />
                {d.saving}
              </>
            ) : (
              d.decideSubmit
            )}
          </Button>
          {hasDecision ? (
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              disabled={decide.isPending}
              onClick={() => {
                form.reset({ decision: rma.decision ?? "", reason: "" });
                setOpen(false);
              }}
            >
              {dict.common.cancel}
            </Button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
