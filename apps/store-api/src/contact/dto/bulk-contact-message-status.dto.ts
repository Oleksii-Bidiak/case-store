import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsEnum, IsUUID } from 'class-validator';
import { ContactMessageStatus } from '@prisma/client';
import { MAX_REORDER_IDS } from '../../common/dto';

/**
 * Body of `PATCH /api/contact/admin/status` (TASK-354).
 *
 * Sets one status on exactly the named messages — the per-row status change of
 * `PATCH /api/contact/admin/:id` applied to a selection. Until this existed,
 * marking fifteen messages read meant opening fifteen detail dialogs.
 *
 * `adminNote` is deliberately NOT part of the payload even though the per-row
 * DTO carries it: a note is a sentence about one conversation, and writing the
 * same sentence onto fifteen unrelated messages would destroy fifteen existing
 * notes with no way back. Only the status generalises.
 *
 * The id cap reuses {@link MAX_REORDER_IDS}, as the category / product / review
 * bulk endpoints do: all are bounded batch writes driven by an on-screen
 * selection, and an operator cannot select more rows than a page holds.
 */
export class BulkContactMessageStatusDto {
  @ApiProperty({
    description: 'Ids of the messages whose status is being set.',
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_REORDER_IDS)
  @IsUUID('4', { each: true })
  ids!: string[];

  @ApiProperty({
    description: 'The status to write onto every listed message.',
    enum: ContactMessageStatus,
    example: ContactMessageStatus.READ,
  })
  @IsEnum(ContactMessageStatus, {
    message: `status must be one of: ${Object.values(ContactMessageStatus).join(', ')}`,
  })
  status!: ContactMessageStatus;
}
