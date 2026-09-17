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
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * DTO for creating a device model (TASK-190). Admin-only. Slug is auto-generated
 * from the name when omitted; `deviceBrandId` must reference an existing brand.
 */
export class CreateDeviceModelDto {
  @ApiProperty({
    description: 'Owning device brand ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID('loose', { message: 'Device brand ID must be a valid UUID' })
  deviceBrandId!: string;

  @ApiProperty({ description: 'Device model name', example: 'iPhone 15 Pro' })
  @IsString()
  @MaxLength(255, { message: 'Device model name must be at most 255 characters' })
  name!: string;

  @ApiProperty({
    description: 'URL-friendly slug (auto-generated from name if not provided)',
    example: 'iphone-15-pro',
    required: false,
  })
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
  })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Series must be at most 255 characters' })
  series?: string;

  @ApiProperty({ description: 'Release year (informational)', example: 2023, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Release year must be an integer' })
  @Min(1990, { message: 'Release year must be at least 1990' })
  @Max(2100, { message: 'Release year must be at most 2100' })
  releaseYear?: number;

  @ApiProperty({
    description: 'Whether the model is active and publicly visible',
    example: true,
    required: false,
    default: true,
  })
  @IsOptional()
  @IsBoolean({ message: 'isActive must be true or false' })
  isActive?: boolean;

  // ─── Compatibility-landing copy (TASK-490) ─────────────────────────────────
  // Overrides for `/catalog/<категорія>/<модель>`; omitted means "generated".
  // Same 255/500 caps the category form uses, so one admin habit covers both.

  @ApiProperty({
    description: 'Admin override for the compatibility landing page <title>',
    example: 'Чохли для iPhone 15 Pro — купити в CaseStore',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Meta title must be at most 255 characters' })
  metaTitle?: string;

  @ApiProperty({
    description: 'Admin override for the compatibility landing page meta description',
    example: 'Понад 40 чохлів для iPhone 15 Pro: силікон, шкіра, MagSafe.',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Meta description must be at most 500 characters' })
  metaDescription?: string;

  @ApiProperty({
    description: 'Admin override for the landing page lead paragraph under the H1',
    example: 'Усі чохли, що точно сідають на iPhone 15 Pro.',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Description must be at most 2000 characters' })
  description?: string;
}
