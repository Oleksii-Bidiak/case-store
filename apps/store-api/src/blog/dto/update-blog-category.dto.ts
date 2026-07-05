import { IsString, IsOptional, IsInt, MaxLength, Min, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * DTO for updating a blog category (admin-only). All fields optional — only
 * provided fields are written.
 */
export class UpdateBlogCategoryDto {
  @ApiProperty({ description: 'Category display name', example: 'Гайди', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120, { message: 'Name must be at most 120 characters' })
  name?: string;

  @ApiProperty({ description: 'URL-friendly slug', example: 'guides', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Slug must be at most 255 characters' })
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      'Slug must be lowercase, contain only letters, numbers, and hyphens, and not start or end with a hyphen',
  })
  slug?: string;

  @ApiProperty({
    description: 'Sort order for display (lower values appear first)',
    example: 10,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Sort order must be an integer' })
  @Min(0, { message: 'Sort order must be at least 0' })
  sortOrder?: number;
}
