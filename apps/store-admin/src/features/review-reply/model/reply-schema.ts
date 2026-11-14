import { z } from "zod";
import { dict } from "@/shared/config";

const d = dict.reviews;

/**
 * `CreateReviewReplyDto.body` — `@MaxLength(REVIEW_REPLY_MAX_LENGTH)` on the API
 * (`apps/store-api/src/review/dto/create-review-reply.dto.ts`); read by the
 * schema, the textarea's `maxLength` and the counter (TASK-1984, Rule 5d).
 */
export const REPLY_MAX_LENGTH = 1000;

/**
 * The reply dialog's one field, the client half of the DTO's
 * `@Transform(trim) @IsNotEmpty @MaxLength(1000)` (TASK-1984, Rule 5d): an
 * answer of spaces is refused with words under the field, not by a button that
 * silently does nothing. The parsed body is TRIMMED — what gets published.
 */
export const replySchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, d.replyRequired)
    .max(REPLY_MAX_LENGTH, d.replyTooLong(REPLY_MAX_LENGTH)),
});

export type ReplyFormValues = z.input<typeof replySchema>;
export type ReplyFormOutput = z.output<typeof replySchema>;
