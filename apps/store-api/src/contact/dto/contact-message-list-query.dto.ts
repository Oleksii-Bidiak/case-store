import { IsOptional, IsInt, IsEnum, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ContactMessageStatus } from '@prisma/client';

/**
 * Query DTO for the admin contact-message inbox: pagination plus an optional
 * status filter (NEW / IN_PROGRESS / READ / ARCHIVED). Newest-first ordering is fixed in the
 * repository.
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
}
