"use client";

import { useEffect } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Callout,
  FieldError,
  FormAlert,
  Input,
  Label,
  Switch,
  Textarea,
} from "@/shared/ui";
import { cn } from "@/shared/lib/utils";
import { dict } from "@/shared/config";
import {
  FAQ_ANSWER_MAX,
  FAQ_QUESTION_MAX,
  faqSchema,
  type FaqFormInput,
  type FaqFormValues,
} from "../model/faq-schema";

const f = dict.faqForm;

interface FaqFormProps {
  /** Entity id (edit mode). Drives the forms.md Rule 2b reset: the form
   *  re-seeds from `defaultValues` only when navigating to a different item,
   *  never on a background refetch. Omitted in create mode. */
  id?: string;
  defaultValues?: Partial<FaqFormInput>;
  onSubmit: (values: FaqFormValues) => void;
  isPending: boolean;
  submitLabel?: string;
  /** «Скасувати» (or «Закрити» when read-only). */
  onCancel?: () => void;
  /** No `faq:write`: fields disabled, no submit (wave 191 canon). */
  readOnly?: boolean;
}

/** Empty form baseline used for create mode and as the merge base in edit mode. */
const EMPTY_VALUES: FaqFormInput = {
  question: "",
  answer: "",
  isActive: true,
};

const errorId = (field: string) => `faq-${field}-error`;

/**
 * Create/edit FAQ form (FaqProposal ЧП4–ЧП8): question and answer with their
 * hints UNDER the field and a counter against the API's own limits, «Показувати
 * на сайті» as a Switch, and a preview of the item as `/info` renders it.
 *
 * TASK-428 removed the "Порядок сортування" number field: the position is set
 * by dragging a row in the FAQ list, and a new question is appended by the
 * server.
 */
export function FaqForm({
  id,
  defaultValues,
  onSubmit,
  isPending,
  submitLabel = f.submit,
  onCancel,
  readOnly = false,
}: FaqFormProps) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, submitCount },
  } = useForm<FaqFormInput, unknown, FaqFormValues>({
    resolver: zodResolver(faqSchema),
    defaultValues: EMPTY_VALUES,
  });

  // forms.md Rule 2b: re-seed only when navigating to a different entity (`id`
  // changes), NOT on every render or background refetch.
  useEffect(() => {
    if (id && defaultValues) {
      reset({ ...EMPTY_VALUES, ...defaultValues });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const question = useWatch({ control, name: "question" }) ?? "";
  const answer = useWatch({ control, name: "answer" }) ?? "";
  const hasErrors = Boolean(errors.question || errors.answer);

  const fieldA11y = (field: "question" | "answer", hintId: string) => ({
    "aria-invalid": errors[field] ? true : undefined,
    "aria-describedby": [errors[field] ? errorId(field) : undefined, hintId]
      .filter(Boolean)
      .join(" "),
  });

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
      noValidate
    >
      {readOnly ? (
        <Callout variant="strip">{dict.common.viewOnly}</Callout>
      ) : null}
      {submitCount > 0 && hasErrors ? (
        <FormAlert>{f.formAlert}</FormAlert>
      ) : null}

      <fieldset disabled={readOnly} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor="faq-question" required>
              {f.question}
            </Label>
            <Counter
              label={f.question}
              count={question.length}
              max={FAQ_QUESTION_MAX}
            />
          </div>
          <Input
            id="faq-question"
            aria-required="true"
            placeholder={f.questionPlaceholder}
            {...fieldA11y("question", "faq-question-hint")}
            {...register("question")}
          />
          <FieldError id={errorId("question")}>
            {errors.question?.message}
          </FieldError>
          <p id="faq-question-hint" className="text-xs text-muted-foreground">
            {f.questionHint}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor="faq-answer" required>
              {f.answer}
            </Label>
            <Counter
              label={f.answer}
              count={answer.length}
              max={FAQ_ANSWER_MAX}
            />
          </div>
          <Textarea
            id="faq-answer"
            rows={4}
            aria-required="true"
            placeholder={f.answerPlaceholder}
            {...fieldA11y("answer", "faq-answer-hint")}
            {...register("answer")}
          />
          <FieldError id={errorId("answer")}>
            {errors.answer?.message}
          </FieldError>
          <p id="faq-answer-hint" className="text-xs text-muted-foreground">
            {f.answerHint}
          </p>
        </div>

        <div className="flex items-start gap-3">
          <Controller
            control={control}
            name="isActive"
            render={({ field }) => (
              <Switch
                id="faq-active"
                checked={field.value ?? true}
                onCheckedChange={field.onChange}
                onBlur={field.onBlur}
                aria-describedby="faq-active-hint"
                className="mt-0.5"
              />
            )}
          />
          <div className="flex flex-col gap-1">
            <Label htmlFor="faq-active">{f.isActive}</Label>
            <p id="faq-active-hint" className="text-xs text-muted-foreground">
              {f.isActiveHint}
            </p>
          </div>
        </div>
      </fieldset>

      {/* ЧП4 — how the item reads on /info, once there is something to read. */}
      {question.trim() && answer.trim() ? (
        <section
          aria-label={f.preview}
          className="flex flex-col gap-1.5 rounded-md border border-dashed px-3.5 py-3"
        >
          <span className="text-xs text-muted-foreground">{f.preview}</span>
          <p className="flex justify-between gap-2 text-sm font-semibold text-foreground">
            <span className="min-w-0 break-words">{question}</span>
            <span aria-hidden="true">−</span>
          </p>
          <p className="text-sm break-words whitespace-pre-line text-muted-foreground">
            {answer}
          </p>
        </section>
      ) : null}

      <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
        {onCancel ? (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="max-md:h-11"
          >
            {readOnly ? dict.common.close : dict.common.cancel}
          </Button>
        ) : null}
        {readOnly ? null : (
          <Button type="submit" disabled={isPending} className="max-md:h-11">
            {isPending ? dict.common.saving : submitLabel}
          </Button>
        )}
      </div>
    </form>
  );
}

/** «24 / 500» next to a label; read in full by a screen reader. */
function Counter({
  label,
  count,
  max,
}: {
  label: string;
  count: number;
  max: number;
}) {
  return (
    <span
      className={cn(
        "text-xs tabular-nums",
        count > max ? "text-destructive" : "text-muted-foreground",
      )}
    >
      <span aria-hidden="true">{f.counter(count, max)}</span>
      <span className="sr-only">{f.counterAria(label, count, max)}</span>
    </span>
  );
}
