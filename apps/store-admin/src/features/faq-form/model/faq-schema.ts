import { z } from "zod";
import type { CreateFaqItemDto, UpdateFaqItemDto } from "@/entities/faq";
import type { FaqItemEntity } from "@/entities/faq";
import { dict } from "@/shared/config";

const e = dict.faqForm.errors;

/**
 * Validation schema for the admin FAQ form (TASK-242).
 *
 * `sortOrder` is modelled as a string on the INPUT side (bound to a number
 * input) and parsed to a number on the OUTPUT side — blank means 0 — so
 * react-hook-form registration stays string-only while `onSubmit` receives a
 * number. `question`/`answer` are required; `isActive` is the visibility toggle.
 */
export const faqSchema = z.object({
  question: z
    .string()
    .trim()
    .min(1, e.questionRequired)
    .max(500, e.questionMax),

  answer: z.string().trim().min(1, e.answerRequired).max(5000, e.answerMax),

  sortOrder: z
    .string()
    .trim()
    .optional()
    .refine(
      (v) => v === undefined || v === "" || /^\d+$/.test(v),
      e.sortOrderInt,
    )
    .transform((v) => (v === undefined || v === "" ? 0 : Number(v))),

  isActive: z.boolean().optional(),
});

export type FaqFormInput = z.input<typeof faqSchema>;
export type FaqFormValues = z.output<typeof faqSchema>;

/**
 * Map parsed form values to a create/update payload. Create and update share the
 * same additive shape; `sortOrder` and `isActive` are always sent.
 */
export function faqFormValuesToDto(
  values: FaqFormValues,
): CreateFaqItemDto & UpdateFaqItemDto {
  return {
    question: values.question,
    answer: values.answer,
    sortOrder: values.sortOrder,
    isActive: values.isActive,
  };
}

/** Map a fetched FAQ entity onto the form's string-based input shape. */
export function mapFaqToFormValues(item: FaqItemEntity): FaqFormInput {
  return {
    question: item.question,
    answer: item.answer,
    sortOrder: String(item.sortOrder),
    isActive: item.isActive,
  };
}
