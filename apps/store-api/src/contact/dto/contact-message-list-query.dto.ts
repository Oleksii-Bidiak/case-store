import { IsOptional, IsInt, IsEnum, IsIn, IsString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ContactMessageStatus } from '@prisma/client';

/**
 * Sortable columns of the admin inbox (TASK-354).
 *
 * The visible columns are name / topic / message / status / date. `message` and
 * `topic` are left out on purpose: ordering a support queue by the text of the
 * message is not a triage anyone performs, and `topic` is a free-form nullable
 * string that would sort into one long block of NULLs.
 *
 * `status` orders by the ContactMessageStatus DECLARATION order — NEW,
 * IN_PROGRESS, READ, ARCHIVED — which is exactly the triage order an operator
 * wants. Asserted here so a future reorder of the enum is a conscious act.
 */
export const CONTACT_MESSAGE_SORT_FIELDS = ['createdAt', 'status', 'name'] as const;
export type ContactMessageSortField = (typeof CONTACT_MESSAGE_SORT_FIELDS)[number];

/**
 * Query DTO for the admin contact-message inbox: pagination, an optional
 * status filter (NEW / IN_PROGRESS / READ / ARCHIVED), and sorting (TASK-354).
 */
export class ContactMessageListQueryDto {
  @ApiProperty({ description: 'Page number (1-based)', example: 1, required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page must be an integer' })
  @Min(1, { message: 'Page must be at least 1' })
  page?: number = 1;

  @ApiProperty({
    description: 'Number of items per page',
    example: 20,
    required: false,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit must be an integer' })
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(100, { message: 'Limit must be at most 100' })
  limit?: number = 20;

  @ApiProperty({
    description: 'Filter by message status (NEW, IN_PROGRESS, READ, ARCHIVED)',
    enum: ContactMessageStatus,
    example: ContactMessageStatus.NEW,
    required: false,
  })
  @IsOptional()
  @IsEnum(ContactMessageStatus, {
    message: `status must be one of: ${Object.values(ContactMessageStatus).join(', ')}`,
  })
  status?: ContactMessageStatus;

  @ApiProperty({
    description: `Sort field (${CONTACT_MESSAGE_SORT_FIELDS.join(', ')})`,
    required: false,
    default: 'createdAt',
    example: 'createdAt',
  })
  @IsOptional()
  @IsString()
  // Allow-listed rather than free-form: an unknown column has to come back as a
  // 400 from the boundary, not as a Prisma error the operator reads as a 500.
  @IsIn(CONTACT_MESSAGE_SORT_FIELDS, {
    message: `sortBy must be one of: ${CONTACT_MESSAGE_SORT_FIELDS.join(', ')}`,
  })
  sortBy?: ContactMessageSortField = 'createdAt';

  @ApiProperty({
    description: 'Sort order (asc or desc)',
    required: false,
    default: 'desc',
    example: 'desc',
  })
  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'], { message: 'sortOrder must be asc or desc' })
  sortOrder?: 'asc' | 'desc' = 'desc';
}
