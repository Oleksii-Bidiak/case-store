import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsUUID,
  IsUrl,
  MaxLength,
  Min,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PublishFieldsDto } from '../../publishing';

/**
 * DTO for creating a blog post (admin-only). Slug is auto-generated from the
 * title when omitted. Publish control (`status` + `scheduledAt`) comes from the
 * shared {@link PublishFieldsDto}. The HTML `content` is sanitized server-side.
 */
export class CreateBlogPostDto extends PublishFieldsDto {
  @ApiProperty({ description: 'Post title', example: 'iPhone 16 проти iPhone 15' })
  @IsString()
  @MaxLength(255, { message: 'Title must be at most 255 characters' })
  title!: string;

  @ApiProperty({
    description: 'Post body as HTML (Tiptap output)',
    example: '<h2>Дизайн</h2><p>Текст…</p>',
  })
  @IsString()
  content!: string;

  @ApiProperty({
    description: 'Short summary shown on cards and used as meta description',
    example: 'Розібрали камери, продуктивність та автономність.',
  })
  @IsString()
  @MaxLength(500, { message: 'Excerpt must be at most 500 characters' })
  excerpt!: string;

  @ApiProperty({ description: 'Category id', example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID('loose', { message: 'categoryId must be a valid UUID' })
  categoryId!: string;

  @ApiProperty({ description: 'Author display name', example: 'Олег Пилипенко' })
  @IsString()
  @MaxLength(120, { message: 'Author name must be at most 120 characters' })
  authorName!: string;

  @ApiProperty({
    description: 'URL-friendly slug (auto-generated from title if not provided)',
    example: 'iphone16-vs-15',
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
    description: 'Cover image URL',
    example: 'https://cdn.example.com/blog/iphone16.jpg',
    required: false,
  })
  @IsOptional()
  @IsUrl({ require_tld: false }, { message: 'coverImageUrl must be a valid URL' })
  @MaxLength(2048, { message: 'Cover image URL must be at most 2048 characters' })
  coverImageUrl?: string;

  @ApiProperty({
    description: 'Blurred placeholder data URI for the cover (LQIP)',
    example: 'data:image/png;base64,iVBORw0KG…',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(20000, { message: 'Cover blur data URI is too large' })
  coverBlurDataUrl?: string;

  @ApiProperty({
    description: 'Estimated reading time in minutes',
    example: 8,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Reading minutes must be an integer' })
  @Min(1, { message: 'Reading minutes must be at least 1' })
  readingMinutes?: number;

  @ApiProperty({
    description: 'Whether the post is the featured hero post',
    example: false,
    required: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'featured must be a boolean' })
  featured?: boolean;
}
