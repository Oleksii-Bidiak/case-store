import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsUUID,
  MaxLength,
  Min,
  Max,
  Matches,
  ValidateIf,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * DTO for updating a device model (TASK-190). Admin-only. All fields optional —
 * only provided fields are updated. `series`/`releaseYear` accept an explicit
 * `null` to clear the override.
 */
export class UpdateDeviceModelDto {
  @ApiProperty({
    description: 'Owning device brand ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
    required: false,
  })
  @IsOptional()
  @IsUUID('all', { message: 'Device brand ID must be a valid UUID' })
  deviceBrandId?: string;

  @ApiProperty({ description: 'Device model name', example: 'iPhone 15 Pro', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Device model name must be at most 255 characters' })
  name?: string;

  @ApiProperty({ description: 'URL-friendly slug', example: 'iphone-15-pro', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Slug must be at most 255 characters' })
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      'Slug must be lowercase, contain only letters, numbers, and hyphens, and not start or end with a hyphen',
  })
  slug?: string;

  @ApiProperty({
    description: 'Series grouping for the picker cascade (e.g. "iPhone 15")',
    example: 'iPhone 15',
    required: false,
    nullable: true,
    type: String,
  })
  @IsOptional()
  @ValidateIf((o: UpdateDeviceModelDto) => o.series !== null)
  @IsString()
  @MaxLength(255, { message: 'Series must be at most 255 characters' })
  series?: string | null;

  @ApiProperty({
    description: 'Release year (informational)',
    example: 2023,
    required: false,
    nullable: true,
    type: Number,
  })
  @IsOptional()
  @ValidateIf((o: UpdateDeviceModelDto) => o.releaseYear !== null)
  @Type(() => Number)
  @IsInt({ message: 'Release year must be an integer' })
  @Min(1990, { message: 'Release year must be at least 1990' })
  @Max(2100, { message: 'Release year must be at most 2100' })
  releaseYear?: number | null;

  @ApiProperty({
    description: 'Whether the model is active and publicly visible',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'isActive must be true or false' })
  isActive?: boolean;
}
