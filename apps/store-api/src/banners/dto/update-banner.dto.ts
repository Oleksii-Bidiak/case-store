import { IsString, IsOptional, IsEnum, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { BannerPlacement } from '@prisma/client';
import { PublishFieldsDto } from '../../publishing';

/** Trim leading/trailing whitespace from string inputs (leave non-strings as-is). */
const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * DTO for updating a homepage banner (admin-only). All fields optional — only
 * provided fields are written. Publish control (`status` + `scheduledAt`) comes
 * from the shared {@link PublishFieldsDto}.
 */
export class UpdateBannerDto extends PublishFieldsDto {
  @ApiProperty({
    description: 'Homepage placement slot',
    enum: BannerPlacement,
    example: BannerPlacement.HERO_SLIDE,
    required: false,
  })
  @IsOptional()
  @IsEnum(BannerPlacement, {
    message: `placement must be one of: ${Object.values(BannerPlacement).join(', ')}`,
  })
  placement?: BannerPlacement;

  @ApiProperty({ description: 'Banner headline', example: 'Літній розпродаж', required: false })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255, { message: 'Title must be at most 255 characters' })
  title?: string;

  @ApiProperty({
    description: 'Supporting text under the headline',
    example: 'Знижки до -50% на аксесуари',
    required: false,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500, { message: 'Subtitle must be at most 500 characters' })
  subtitle?: string;

  @ApiProperty({
    description: 'Banner image URL (absolute or storefront-relative)',
    example: '/images/banners/summer.jpg',
    required: false,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2048, { message: 'Image URL must be at most 2048 characters' })
  imageUrl?: string;

  @ApiProperty({ description: 'Base64 blur placeholder for next/image', required: false })
  @IsOptional()
  @IsString()
  imageBlurDataUrl?: string;

  @ApiProperty({ description: 'Call-to-action label', example: 'Купити зараз', required: false })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100, { message: 'CTA label must be at most 100 characters' })
  ctaLabel?: string;

  @ApiProperty({ description: 'Call-to-action link (href)', example: '/catalog', required: false })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2048, { message: 'CTA href must be at most 2048 characters' })
  ctaHref?: string;

  @ApiProperty({
    description: 'Optional accent / variant key interpreted by the storefront UI',
    example: 'accent',
    required: false,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(50, { message: 'Theme must be at most 50 characters' })
  theme?: string;

  // TASK-295: no `sortOrder` — a new row is appended by the repository (max + 1) and the
  // order is edited only through the reorder endpoint, never through this form.
}
