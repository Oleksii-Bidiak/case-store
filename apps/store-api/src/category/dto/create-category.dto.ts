import {
  IsString,
  IsOptional,
  IsBoolean,
  IsUUID,
  IsInt,
  MaxLength,
  Min,
  Matches,
  IsUrl,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * DTO for creating a new category.
 *
 * Admin-only endpoint. Slug is auto-generated from name if not provided.
 * ParentId references another Category to build a hierarchy.
 */
export class CreateCategoryDto {
  @ApiProperty({
    description: 'Category name',
    example: 'Phone Cases',
  })
  @IsString()
  @MaxLength(255, { message: 'Category name must be at most 255 characters' })
  name!: string;

  @ApiProperty({
    description: 'URL-friendly slug (auto-generated from name if not provided)',
    example: 'phone-cases',
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
    description: 'Category description',
    example: 'Protective cases for all smartphone models',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000, {
    message: 'Description must be at most 2000 characters',
  })
  description?: string;

  @ApiProperty({
    description: 'URL of the category image',
    example: 'https://example.com/images/phone-cases.jpg',
    required: false,
  })
  @IsOptional()
  @IsUrl({}, { message: 'Image must be a valid URL' })
  image?: string;

  @ApiProperty({
    description: 'Parent category ID for building hierarchy (null for root categories)',
    example: '550e8400-e29b-41d4-a716-446655440000',
    required: false,
  })
  @IsOptional()
  @IsUUID(4, { message: 'Parent ID must be a valid UUID' })
  parentId?: string;

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

  @ApiProperty({
    description: 'Whether the category is active and visible in the store',
    example: true,
    required: false,
    default: true,
  })
  @IsOptional()
  @IsBoolean({ message: 'isActive must be true or false' })
  isActive?: boolean;
}
