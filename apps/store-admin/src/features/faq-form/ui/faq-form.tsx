"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, FormActionsBar, Input, Label, Textarea } from "@/shared/ui";
import { dict } from "@/shared/config";
import {
  faqSchema,
  type FaqFormInput,
  type FaqFormValues,
} from "../model/faq-schema";

interface FaqFormProps {
  /** Entity id (edit mode). Drives the forms.md Rule 2b reset: the form
   *  re-seeds from `defaultValues` only when navigating to a different item,
   *  never on a background refetch. Omitted in create mode. */
  id?: string;
  defaultValues?: Partial<FaqFormInput>;
  onSubmit: (values: FaqFormValues) => void;
  isPending: boolean;
  submitLabel?: string;
}

/** Empty form baseline used for create mode and as the merge base in edit mode. */
const EMPTY_VALUES: FaqFormInput = {
  question: "",
  answer: "",
  sortOrder: "0",
  isActive: true,
};

/**
 * Reusable create/edit FAQ form: question, answer, sort order, and the active
 * toggle. Every field carries a plain-UA hint (`dict.faqForm.*Hint`) so a
 * non-technical admin understands what it controls (plan 116's core framing).
 */
export function FaqForm({
  id,
  defaultValues,
  onSubmit,
  isPending,
  submitLabel = dict.faqForm.submit,
}: FaqFormProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
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

  const f = dict.faqForm;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex max-w-2xl flex-col gap-5"
      noValidate
    >
      {/* Question */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="faq-question">{f.question}</Label>
        <p className="text-sm text-muted-foreground">{f.questionHint}</p>
        <Input
          id="faq-question"
          placeholder={f.questionPlaceholder}
          {...register("question")}
        />
        {errors.question && (
          <p role="alert" className="text-sm text-destructive">
            {errors.question.message}
          </p>
        )}
      </div>

      {/* Answer */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="faq-answer">{f.answer}</Label>
        <p className="text-sm text-muted-foreground">{f.answerHint}</p>
        <Textarea
          id="faq-answer"
          rows={4}
          placeholder={f.answerPlaceholder}
          {...register("answer")}
        />
        {errors.answer && (
          <p role="alert" className="text-sm text-destructive">
            {errors.answer.message}
          </p>
        )}
      </div>

      {/* Sort order */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="faq-sort-order">{f.sortOrder}</Label>
        <p className="text-sm text-muted-foreground">{f.sortOrderHint}</p>
        <Input
          id="faq-sort-order"
          type="number"
          min={0}
          step={1}
          className="w-32"
          {...register("sortOrder")}
        />
        {errors.sortOrder && (
          <p role="alert" className="text-sm text-destructive">
            {errors.sortOrder.message}
          </p>
        )}
      </div>

      {/* Active toggle */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <input
            id="faq-active"
            type="checkbox"
            className="size-4 rounded border-border accent-primary"
            {...register("isActive")}
          />
          <Label htmlFor="faq-active">{f.isActive}</Label>
        </div>
        <p className="text-sm text-muted-foreground">{f.isActiveHint}</p>
      </div>

      <FormActionsBar>
        <Button type="submit" disabled={isPending}>
          {isPending ? dict.common.saving : submitLabel}
        </Button>
      </FormActionsBar>
    </form>
  );
}
