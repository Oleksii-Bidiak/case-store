import { IsEnum, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PublishStatus } from '@prisma/client';

/**
 * Shared publish-control fields for admin create/update DTOs across content
 * models (Pages today; blog posts and banners later). Compose it into a model's
 * DTO by extending it, or copy the two decorated fields.
 *
 * Both fields are OPTIONAL so the SAME class composes cleanly into create DTOs
 * (status omitted → service defaults to DRAFT) and partial update DTOs (only
 * provided fields written). `scheduledAt` is validated as an ISO-8601 string and
 * parsed to a `Date` in the service before {@link resolvePublishState}.
 */
export class PublishFieldsDto {
  @ApiProperty({
    description: 'Publish lifecycle state. Omitted on create defaults to DRAFT.',
    enum: PublishStatus,
    example: PublishStatus.PUBLISHED,
    required: false,
  })
  @IsOptional()
  @IsEnum(PublishStatus, {
    message: `status must be one of: ${Object.values(PublishStatus).join(', ')}`,
  })
  status?: PublishStatus;

  @ApiProperty({
    description:
      'ISO-8601 instant to auto-publish at (only meaningful with status = SCHEDULED). ' +
      'A past/absent date collapses to immediate PUBLISHED.',
    example: '2026-08-01T09:00:00.000Z',
    required: false,
    type: String,
    format: 'date-time',
  })
  @IsOptional()
  @IsDateString({}, { message: 'scheduledAt must be an ISO-8601 date-time string' })
  scheduledAt?: string;
}
