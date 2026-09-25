import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsIP,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Moderation-queue filter — the TEXT's status, one value per
 * {@link import('@prisma/client').ReviewTextStatus}.
 *
 * `rejected` exists since TASK-585 because rejecting stopped deleting. The pile
 * of turned-down texts is now a real population, and without a filter for it a
 * moderator could neither review their own decisions nor undo one.
 */
export enum ReviewModerationStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  /**
   * Every row whatever its text verdict, STAR-ONLY RATINGS INCLUDED (TASK-601).
   *
   * Not a queue but the record: the three piles above are about texts, and a
   * star-only rating — the usual shape of rating abuse — is in none of them. The
   * `ratingAbuse` dashboard card opens this, narrowed by `productId` or
   * `createdIp`, so the operator lands on the very series the signal counted.
   */
  ALL = 'all',
}

/**
 * Moderation-list filter by the moderator's account-wide hide (TASK-596).
 *
 * `visible` is the queue as it always was, and stays the default so the list and
 * the dashboard badge above it keep counting the same rows. `hidden` reaches the
 * rows of withdrawn accounts — until this filter the panel had no way to list
 * them, and a row with `ratingVisible = false` could mean either "a moderator hid
 * this account" or "the author has not confirmed their address", which call for
 * different actions.
 */
export enum ReviewAuthorVisibility {
  VISIBLE = 'visible',
  HIDDEN = 'hidden',
  ALL = 'all',
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

  @ApiProperty({
    description:
      'Filter by the moderator’s account-wide hide (TASK-596): `visible` — authors nobody has ' +
      'withdrawn (the queue, default); `hidden` — rows of withdrawn accounts only; `all` — both',
    enum: ReviewAuthorVisibility,
    enumName: 'ReviewAuthorVisibility',
    required: false,
    default: ReviewAuthorVisibility.VISIBLE,
  })
  @IsOptional()
  @IsEnum(ReviewAuthorVisibility)
  visibility?: ReviewAuthorVisibility;

  @ApiProperty({
    description:
      'Only reviews of this product (TASK-601) — what the rating-abuse card links to for a ' +
      'burst of ratings on one product',
    required: false,
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID('loose')
  productId?: string;

  @ApiProperty({
    description:
      'Only reviews submitted from this address (TASK-601) — what the rating-abuse card links ' +
      'to for a run of 1★ from one IP. Rows written before addresses were recorded never match',
    required: false,
    example: '203.0.113.42',
  })
  @IsOptional()
  @IsIP()
  createdIp?: string;

  @ApiProperty({ description: 'Page number (1-based)', required: false, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiProperty({
    description: 'Items per page',
    required: false,
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  // TASK-423: raised from 50 to the 100 every other list DTO allows. The admin
  // panel now offers one rows-per-page control (20 / 50 / 100) on every table,
  // and a queue that alone refused 100 would answer the shared control with a
  // 400 the operator reads as a broken screen.
  @Max(100)
  limit?: number;

  @ApiProperty({
    description:
      'Free-text search across the review text, the author email and the product name ' +
      '(TASK-423). The moderation queue had no search at all, so triaging a backlog meant ' +
      'paging through it — and answering "what did this customer write about that product?" ' +
      'was impossible from this screen.',
    required: false,
    maxLength: 120,
    example: 'чохол',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  // Read the ORIGINAL value off `obj` (the `enableImplicitConversion` guard the
  // whole API uses), trim it, and collapse an all-whitespace term to undefined so
  // "no filter" cannot arrive disguised as an empty string — which would become
  // `contains: ''` and match every row.
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const raw = obj[key];
    if (typeof raw !== 'string') return undefined;
    const trimmed = raw.trim();
    return trimmed === '' ? undefined : trimmed;
  })
  search?: string;
}
