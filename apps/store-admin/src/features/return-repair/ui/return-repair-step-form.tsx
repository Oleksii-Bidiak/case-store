"use client";

import { useId, useRef } from "react";
import { useForm, useWatch, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "@/shared/ui/toast";
import {
  RepairResult,
  ReturnRepairStep,
  getAdminOrderReturnControllerFindForOrderQueryKey,
  getAdminReturnControllerFindAllQueryKey,
  getAdminReturnControllerFindByIdQueryKey,
  useAdminReturnControllerAddRepairStep,
  type ReturnEntity,
} from "@/entities/return";
import {
  Button,
  FieldError,
  Input,
  Label,
  RadioCard,
  RadioCardGroup,
  Textarea,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { repairErrorOf } from "../model/repair-error";
import {
  REPAIR_DEFAULT_VALUES,
  REPAIR_DESTINATION_MAX_LENGTH,
  REPAIR_NOTE_MAX_LENGTH,
  REPAIR_STEP_FIELDS,
  REPAIR_TTN_MAX_LENGTH,
  createRepairSchema,
  repairValuesToDto,
  type RepairFormValues,
} from "../model/repair-schema";
import { repairResultLabel, repairStepLabel } from "../model/repair-steps";

const d = dict.returns;

const RESULTS: readonly RepairResult[] = [
  RepairResult.REPAIRED,
  RepairResult.UNREPAIRABLE,
];

interface ReturnRepairStepFormProps {
  rma: ReturnEntity;
  /** The step the page knows to be next — the form records exactly this one. */
  step: ReturnRepairStep;
  /** After a step is recorded: the panel moves focus off the vanished form. */
  onRecorded?: () => void;
}

/**
 * The form for exactly the next repair step (TASK-2045). The caller keys it by
 * the step, so a recorded step brings a fresh, empty form for the following
 * one. That remount happens on a successful save (or when another operator
 * moved the repair on), never while typing — forms.md's ban on key-remounts is
 * about remounting under a keystroke.
 *
 * Nothing is seeded from server data: the fields are what the operator writes
 * now, so plain defaults are right (forms.md Rule 2 is about edit forms).
 */
export function ReturnRepairStepForm({
  rma,
  step,
  onRecorded,
}: ReturnRepairStepFormProps) {
  const queryClient = useQueryClient();
  const record = useAdminReturnControllerAddRepairStep();
  const fields = REPAIR_STEP_FIELDS[step];
  const stepLabel = repairStepLabel(step);

  const headingId = useId();
  const resultLegendId = useId();
  const resultErrorId = `${resultLegendId}-error`;
  const destinationId = useId();
  const ttnId = useId();
  const noteId = useId();
  const customerSeesId = useId();
  const noteHintId = `${noteId}-hint`;
  const resultGroupRef = useRef<HTMLDivElement | null>(null);

  const form = useForm<RepairFormValues>({
    resolver: zodResolver(createRepairSchema(step)),
    defaultValues: REPAIR_DEFAULT_VALUES,
  });
  const result = useWatch({ control: form.control, name: "result" });
  const { errors, isSubmitted } = form.formState;

  const byIdKey = getAdminReturnControllerFindByIdQueryKey(rma.id);

  const onSubmit = (values: RepairFormValues) => {
    record.mutate(
      { returnId: rma.id, data: repairValuesToDto(step, values) },
      {
        onSuccess: (response) => {
          // The response IS the return card, steps included — show it now
          // rather than after a round trip, then let the lists catch up.
          queryClient.setQueryData(byIdKey, response);
          void queryClient.invalidateQueries({ queryKey: byIdKey });
          void queryClient.invalidateQueries({
            queryKey: getAdminReturnControllerFindAllQueryKey(),
          });
          void queryClient.invalidateQueries({
            queryKey: getAdminOrderReturnControllerFindForOrderQueryKey(
              rma.orderId,
            ),
          });
          toast.success(d.repairSuccess(stepLabel));
          onRecorded?.();
        },
        onError: (error) => {
          const outcome = repairErrorOf(error);
          if (outcome.kind === "field") {
            form.setError(
              outcome.field,
              { type: "server", message: outcome.message },
              { shouldFocus: outcome.field !== "result" },
            );
            if (outcome.field === "result") focusResult();
            return;
          }
          if (outcome.refetch) {
            void queryClient.invalidateQueries({ queryKey: byIdKey });
          }
          toast.error(outcome.message);
        },
      },
    );
  };

  // The radios are set from code, not registered — RHF cannot focus them.
  function focusResult() {
    resultGroupRef.current
      ?.querySelector<HTMLButtonElement>('[role="radio"]')
      ?.focus();
  }

  const onInvalid = (invalid: FieldErrors<RepairFormValues>) => {
    if (invalid.result) focusResult();
  };

  const field = (name: "destination" | "ttn" | "note") => {
    const message = errors[name]?.message;
    const errorId = `${name}-${headingId}-error`;
    return { message, errorId };
  };

  const destination = field("destination");
  const ttn = field("ttn");
  const note = field("note");
  const isHandover = step === ReturnRepairStep.HANDED_TO_CUSTOMER;
  const describe = (errorId: string, message: string | undefined) =>
    message ? `${errorId} ${customerSeesId}` : customerSeesId;

  const destinationField = fields.includes("destination") ? (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={destinationId}>
        {isHandover ? d.repairHandoverPointLabel : d.repairServiceLabel}
      </Label>
      <Input
        id={destinationId}
        maxLength={REPAIR_DESTINATION_MAX_LENGTH}
        placeholder={
          isHandover
            ? d.repairHandoverPointPlaceholder
            : d.repairServicePlaceholder
        }
        aria-describedby={describe(destination.errorId, destination.message)}
        aria-invalid={destination.message ? true : undefined}
        {...form.register("destination")}
      />
      {destination.message ? (
        <FieldError id={destination.errorId} className="text-xs">
          {destination.message}
        </FieldError>
      ) : null}
    </div>
  ) : null;

  const ttnField = fields.includes("ttn") ? (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={ttnId}>
        {isHandover ? d.repairHandoverTtnLabel : d.repairTtnLabel}
      </Label>
      <Input
        id={ttnId}
        inputMode="numeric"
        autoComplete="off"
        maxLength={REPAIR_TTN_MAX_LENGTH}
        placeholder={d.repairTtnPlaceholder}
        aria-describedby={describe(ttn.errorId, ttn.message)}
        aria-invalid={ttn.message ? true : undefined}
        {...form.register("ttn")}
      />
      {ttn.message ? (
        <FieldError id={ttn.errorId} className="text-xs">
          {ttn.message}
        </FieldError>
      ) : null}
    </div>
  ) : null;

  const resultError = errors.result?.message;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h4 id={headingId} className="text-sm font-semibold text-foreground">
        {d.repairFormHeading(stepLabel)}
      </h4>
      <form
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          if (record.isPending) {
            event.preventDefault();
            return;
          }
          void form.handleSubmit(onSubmit, onInvalid)(event);
        }}
      >
        {fields.includes("result") ? (
          <div className="flex flex-col gap-1.5">
            <span
              id={resultLegendId}
              className="text-sm font-medium text-foreground"
            >
              {d.repairResultLegend}
            </span>
            <RadioCardGroup
              ref={resultGroupRef}
              aria-labelledby={resultLegendId}
              aria-describedby={
                resultError
                  ? `${resultErrorId} ${customerSeesId}`
                  : customerSeesId
              }
              aria-invalid={resultError ? true : undefined}
              className="sm:grid-cols-2"
              value={result}
              onValueChange={(next) =>
                // forms.md Rule 4a — a value set from code re-validates itself,
                // but only once a submit has armed the messages.
                form.setValue("result", next, {
                  shouldDirty: true,
                  shouldValidate: isSubmitted,
                })
              }
            >
              {RESULTS.map((value) => (
                <RadioCard
                  key={value}
                  value={value}
                  title={repairResultLabel(value)}
                />
              ))}
            </RadioCardGroup>
            {resultError ? (
              <FieldError id={resultErrorId} className="text-xs">
                {resultError}
              </FieldError>
            ) : null}
          </div>
        ) : null}

        {/* The handover: a waybill when it ships, a point when it is picked up. */}
        {isHandover ? (
          <>
            {ttnField}
            {destinationField}
          </>
        ) : (
          <>
            {destinationField}
            {ttnField}
          </>
        )}

        {fields.length > 0 ? (
          <p id={customerSeesId} className="text-xs text-muted-foreground">
            {d.repairCustomerSeesHint}
          </p>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={noteId}>{d.repairNoteLabel}</Label>
          <Textarea
            id={noteId}
            rows={2}
            maxLength={REPAIR_NOTE_MAX_LENGTH}
            aria-describedby={
              note.message ? `${note.errorId} ${noteHintId}` : noteHintId
            }
            aria-invalid={note.message ? true : undefined}
            {...form.register("note")}
          />
          {note.message ? (
            <FieldError id={note.errorId} className="text-xs">
              {note.message}
            </FieldError>
          ) : null}
          <p id={noteHintId} className="text-xs text-muted-foreground">
            {d.repairNoteHint}
          </p>
        </div>

        <Button
          type="submit"
          className="w-full"
          disabled={record.isPending}
          aria-busy={record.isPending || undefined}
        >
          {record.isPending ? (
            <>
              <Loader2
                aria-hidden="true"
                className="animate-spin motion-reduce:animate-none"
              />
              {d.saving}
            </>
          ) : (
            d.repairSubmit(stepLabel)
          )}
        </Button>
      </form>
    </section>
  );
}
