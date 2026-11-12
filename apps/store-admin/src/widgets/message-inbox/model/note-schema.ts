import { z } from "zod";
import { dict } from "@/shared/config";

/**
 * `UpdateContactMessageDto.adminNote` — `@Transform(trimNullable)
 * @MaxLength(2000)` (`apps/store-api/src/contact/dto/update-contact-message.dto.ts`);
 * read by the schema and by the textarea's `maxLength` (TASK-1984, Rule 5d).
 */
export const ADMIN_NOTE_MAX_LENGTH = 2000;

/**
 * The internal note composer's one field. Trimmed like the DTO before the cap
 * is judged; empty is allowed — it clears the note.
 */
export const noteSchema = z.object({
  adminNote: z
    .string()
    .trim()
    .max(
      ADMIN_NOTE_MAX_LENGTH,
      dict.messages.adminNoteTooLong(ADMIN_NOTE_MAX_LENGTH),
    ),
});

export type NoteFormValues = z.input<typeof noteSchema>;
export type NoteFormOutput = z.output<typeof noteSchema>;
