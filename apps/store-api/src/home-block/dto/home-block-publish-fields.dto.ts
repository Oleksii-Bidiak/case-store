import { IsDateString, IsEnum, ValidateIf } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PublishStatus } from '@prisma/client';
import { OnlyWithScheduledStatus } from './only-with-scheduled-status.validator';

/** Validate the field whenever it was SENT — `null` included (TASK-661, W1). */
export const whenSent = (_: object, value: unknown): boolean => value !== undefined;

/**
 * The two publish-control fields of the shared `PublishFieldsDto` (publishing module),
 * tightened for homepage blocks (TASK-661).
 *
 * The shared DTO uses `@IsOptional()`, which waves `null` through as "absent" — a
 * `{ status: null }` then reached the service and silently became a DRAFT on create.
 * Here both fields are validated whenever they are present, so `null` is a 400. The
 * change is LOCAL: pages, blog, banners and carousels keep the shared behaviour.
 *
 * A COPY rather than a subclass on purpose: class-validator drops an inherited rule
 * only when the LEAF class redeclares the property, so a middle class overriding
 * `status` would still inherit the shared `@IsOptional()` — and every condition must
 * hold for a field to be validated, so `null` would keep slipping through.
 *
 * `scheduledAt` is accepted only together with `status: 'SCHEDULED'` — on its own it
 * used to be dropped without a word (an update ignores it without a `status`, and a
 * DRAFT clears it), so an admin who set a date and nothing else saw a 200 and no
 * schedule.
 */
export class HomeBlockPublishFieldsDto {
  @ApiProperty({
    description:
      'Publish lifecycle state. Omitted on create defaults to DRAFT; omitted on update ' +
      'leaves it as is. `null` is rejected.',
    enum: PublishStatus,
    example: PublishStatus.PUBLISHED,
    required: false,
  })
  @ValidateIf(whenSent)
  @IsEnum(PublishStatus, {
    message: `status must be one of: ${Object.values(PublishStatus).join(', ')}`,
  })
  status?: PublishStatus;

  @ApiProperty({
    description:
      'ISO-8601 instant to auto-publish at. Allowed ONLY with status = SCHEDULED (400 ' +
      'otherwise). A past date collapses to immediate PUBLISHED.',
    example: '2026-08-01T09:00:00.000Z',
    required: false,
    type: String,
    format: 'date-time',
  })
  @ValidateIf(whenSent)
  @IsDateString({}, { message: 'scheduledAt must be an ISO-8601 date-time string' })
  @OnlyWithScheduledStatus()
  scheduledAt?: string;
}
