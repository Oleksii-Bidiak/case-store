import { z } from "zod";
import type { CreateFaqItemDto, UpdateFaqItemDto } from "@/entities/faq";
import type { FaqItemEntity } from "@/entities/faq";
import { dict } from "@/shared/config";

const e = dict.faqForm.errors;

/**
 * Validation schema for the admin FAQ form (TASK-242).
 *
 * TASK-428: no `sortOrder` field — the order is set by dragging (or keyboard-moving)
 * rows in the FAQ list, and a new item is appended to the end by the server. The old
 * hand-typed number defaulted to 0 for every row, so nothing was actually ordered.
 * `question`/`answer` are required; `isActive` is the visibility toggle.
 */
export const faqSchema = z.object({
  question: z
    .string()
    .trim()
    .min(1, e.questionRequired)
    .max(500, e.questionMax),

  answer: z.string().trim().min(1, e.answerRequired).max(5000, e.answerMax),

  isActive: z.boolean().optional(),
});

export type FaqFormInput = z.input<typeof faqSchema>;
export type FaqFormValues = z.output<typeof faqSchema>;

/**
 * Map parsed form values to a create/update payload. Create and update share the
 * same additive shape.
 *
 * `sortOrder` is deliberately NOT sent (TASK-428). On create its absence is what makes
 * the server append the item to the END of the list; on update its absence leaves the
 * position the operator dragged the row to untouched.
 */
export function faqFormValuesToDto(
  values: FaqFormValues,
): CreateFaqItemDto & UpdateFaqItemDto {
  return {
    question: values.question,
    answer: values.answer,
    isActive: values.isActive,
  };
}

/** Map a fetched FAQ entity onto the form's input shape. */
export function mapFaqToFormValues(item: FaqItemEntity): FaqFormInput {
  return {
    question: item.question,
    answer: item.answer,
    isActive: item.isActive,
  };
}
