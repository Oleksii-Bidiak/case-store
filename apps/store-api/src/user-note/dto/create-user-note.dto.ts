import { IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/** Longest note we store. Generous — it is a free-text journal entry — but bounded,
 *  because an unbounded `@db.Text` column reachable from a form is a storage bomb. */
export const USER_NOTE_MAX_LENGTH = 2000;

/**
 * Body of `POST /api/admin/users/:userId/notes` (TASK-430).
 *
 * Only the text: the author and the timestamp are stamped by the server from the
 * authenticated actor. Taking an `authorId` from the client would let one operator
 * file a note under a colleague's name, which is the one thing a journal must not
 * allow.
 */
export class CreateUserNoteDto {
  @ApiProperty({
    description: 'The note text (plain text, never rendered as HTML)',
    example: 'Просив передзвонити після 18:00, хоче рахунок на ФОП.',
    minLength: 1,
    maxLength: USER_NOTE_MAX_LENGTH,
  })
  // Trim BEFORE validating, so a body of three spaces is rejected as empty rather
  // than stored as an entry that renders as a blank line nobody can remove.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'body must be a string' })
  @MinLength(1, { message: 'body must not be empty' })
  @MaxLength(USER_NOTE_MAX_LENGTH, {
    message: `body must be at most ${USER_NOTE_MAX_LENGTH} characters`,
  })
  body!: string;
}
