import { IsString, IsOptional, IsBoolean, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for updating a device brand (TASK-190). Admin-only. All fields optional —
 * only provided fields are updated.
 */
export class UpdateDeviceBrandDto {
  @ApiProperty({ description: 'Device brand name', example: 'Apple', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Device brand name must be at most 255 characters' })
  name?: string;

  @ApiProperty({ description: 'URL-friendly slug', example: 'apple', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Slug must be at most 255 characters' })
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      'Slug must be lowercase, contain only letters, numbers, and hyphens, and not start or end with a hyphen',
  })
  slug?: string;

  // TASK-295: no `sortOrder` — a new row is appended by the repository (max + 1) and the
  // order is edited only through the reorder endpoint, never through this form.

  @ApiProperty({
    description: 'Whether the brand is active and publicly visible',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'isActive must be true or false' })
  isActive?: boolean;
}
