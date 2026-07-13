import { IsString, IsOptional, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for creating a blog category (admin-only). Slug is auto-generated from the
 * name when omitted.
 */
export class CreateBlogCategoryDto {
  @ApiProperty({ description: 'Category display name', example: 'Гайди' })
  @IsString()
  @MaxLength(120, { message: 'Name must be at most 120 characters' })
  name!: string;

  @ApiProperty({
    description: 'URL-friendly slug (auto-generated from name if not provided)',
    example: 'guides',
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

  // TASK-295: no `sortOrder` — a new row is appended by the repository (max + 1) and the
  // order is edited only through the reorder endpoint, never through this form.
}
