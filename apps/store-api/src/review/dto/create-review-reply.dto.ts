import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Longest reply we store — the same cap the review it answers is held to. */
export const REVIEW_REPLY_MAX_LENGTH = 1000;

/**
 * Body of `POST /api/admin/reviews/:id/reply` (TASK-587).
 *
 * Only the text. The author is stamped by the server from the authenticated
 * actor, never taken from the client — the same rule as `CreateUserNoteDto`, and
 * for the same reason: an `authorUserId` in the body would let one operator file
 * the shop's public answer under a colleague's name, and this field is the only
 * record of who said it.
 */
export class CreateReviewReplyDto {
  @ApiProperty({
    description: 'The shop’s reply, shown under the review on the storefront',
    example: 'Дякуємо за відгук! Передали ваші зауваження постачальнику.',
    minLength: 1,
    maxLength: REVIEW_REPLY_MAX_LENGTH,
  })
  // Trim BEFORE validating, so three spaces are refused as empty rather than
  // published as a reply block containing a blank line (the `CreateUserNoteDto`
  // precedent — `@IsNotEmpty` alone happily accepts whitespace).
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'body must not be empty' })
  @MaxLength(REVIEW_REPLY_MAX_LENGTH)
  body!: string;
}
