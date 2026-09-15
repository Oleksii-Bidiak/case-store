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
  @IsUUID('loose', { message: 'Device brand ID must be a valid UUID' })
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

  // ─── Compatibility-landing copy (TASK-490) ─────────────────────────────────
  // All three accept an explicit `null` to CLEAR the override and fall back to
  // the generated template — same `ValidateIf` shape `series`/`releaseYear` use
  // above, and the same reason: with `undefined` Prisma reads "no change", so
  // an admin could set an override once and never take it off again.

  @ApiProperty({
    description: 'Admin override for the compatibility landing page <title>',
    example: 'Чохли для iPhone 15 Pro — купити в MobileStore',
    required: false,
    nullable: true,
    type: String,
  })
  @IsOptional()
  @ValidateIf((o: UpdateDeviceModelDto) => o.metaTitle !== null)
  @IsString()
  @MaxLength(255, { message: 'Meta title must be at most 255 characters' })
  metaTitle?: string | null;

  @ApiProperty({
    description: 'Admin override for the compatibility landing page meta description',
    example: 'Понад 40 чохлів для iPhone 15 Pro: силікон, шкіра, MagSafe.',
    required: false,
    nullable: true,
    type: String,
  })
  @IsOptional()
  @ValidateIf((o: UpdateDeviceModelDto) => o.metaDescription !== null)
  @IsString()
  @MaxLength(500, { message: 'Meta description must be at most 500 characters' })
  metaDescription?: string | null;

  @ApiProperty({
    description: 'Admin override for the landing page lead paragraph under the H1',
    example: 'Усі чохли, що точно сідають на iPhone 15 Pro.',
    required: false,
    nullable: true,
    type: String,
  })
  @IsOptional()
  @ValidateIf((o: UpdateDeviceModelDto) => o.description !== null)
  @IsString()
  @MaxLength(2000, { message: 'Description must be at most 2000 characters' })
  description?: string | null;
}
