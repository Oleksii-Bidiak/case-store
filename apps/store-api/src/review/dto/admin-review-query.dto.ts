import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Moderation-queue filter status. `pending` lists reviews awaiting approval
 * (`isActive: false`); `approved` lists already-published reviews.
 */
export enum ReviewModerationStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
}

/**
 * Query parameters for the admin moderation queue. Defaults to the pending
 * queue, which is the admin's primary working view.
 */
export class AdminReviewQueryDto {
  @ApiProperty({
    description: 'Moderation status filter',
    enum: ReviewModerationStatus,
    required: false,
    default: ReviewModerationStatus.PENDING,
  })
  @IsOptional()
  @IsEnum(ReviewModerationStatus)
  status?: ReviewModerationStatus;

  @ApiProperty({ description: 'Page number (1-based)', required: false, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiProperty({
    description: 'Items per page',
    required: false,
    default: 10,
    minimum: 1,
    maximum: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
