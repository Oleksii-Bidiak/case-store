import { IsString, IsOptional, IsEnum, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ContactMessageStatus } from '@prisma/client';

/**
 * Trim a string value; leave non-strings untouched. `null` clears the note.
 */
const trimNullable = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * DTO for an admin update of a contact message: change its status and/or set an
 * internal admin note. Both fields are optional so the admin can patch either
 * independently.
 */
export class UpdateContactMessageDto {
  @ApiProperty({
    description: 'New status (NEW, IN_PROGRESS, READ, ARCHIVED)',
    enum: ContactMessageStatus,
    example: ContactMessageStatus.READ,
    required: false,
  })
  @IsOptional()
  @IsEnum(ContactMessageStatus, {
    message: `status must be one of: ${Object.values(ContactMessageStatus).join(', ')}`,
  })
  status?: ContactMessageStatus;

  @ApiProperty({
    description: 'Internal admin note (null clears it)',
    example: 'Called back, resolved.',
    required: false,
    nullable: true,
    type: String,
  })
  @IsOptional()
  @Transform(trimNullable)
  @IsString()
  @MaxLength(2000, { message: 'Admin note must be at most 2000 characters' })
  adminNote?: string | null;
}
