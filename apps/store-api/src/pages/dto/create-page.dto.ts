import { IsString, IsOptional, IsBoolean, IsInt, MaxLength, Min, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * DTO for creating a static page (admin-only).
 * Slug is auto-generated from the title when omitted.
 */
export class CreatePageDto {
  @ApiProperty({ description: 'Page title', example: 'Privacy Policy' })
  @IsString()
  @MaxLength(255, { message: 'Title must be at most 255 characters' })
  title!: string;

  @ApiProperty({
    description: 'Page body as HTML (Tiptap output)',
    example: '<h2>Section</h2><p>Content…</p>',
  })
  @IsString()
  content!: string;

  @ApiProperty({
    description: 'URL-friendly slug (auto-generated from title if not provided)',
    example: 'privacy-policy',
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
    description: 'Short summary',
    example: 'How we handle your data.',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Excerpt must be at most 500 characters' })
  excerpt?: string;

  @ApiProperty({
    description: 'SEO meta title',
    example: 'Privacy Policy — Mobile Store',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Meta title must be at most 255 characters' })
  metaTitle?: string;

  @ApiProperty({
    description: 'SEO meta description',
    example: 'Read our privacy policy.',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Meta description must be at most 500 characters' })
  metaDescription?: string;

  @ApiProperty({
    description: 'Whether the page is published (visible on the storefront)',
    example: false,
    required: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'isActive must be true or false' })
  isActive?: boolean;

  @ApiProperty({
    description: 'Sort order for display (lower values appear first)',
    example: 0,
    required: false,
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Sort order must be an integer' })
  @Min(0, { message: 'Sort order must be at least 0' })
  sortOrder?: number;
}
