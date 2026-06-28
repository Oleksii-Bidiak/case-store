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
  ValidateIf,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * DTO for updating an existing category.
 *
 * All fields are optional — only provided fields will be updated.
 * Admin-only endpoint.
 */
export class UpdateCategoryDto {
  @ApiProperty({
    description: 'Category name',
    example: 'Phone Cases',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Category name must be at most 255 characters' })
  name?: string;

  @ApiProperty({
    description: 'URL-friendly slug',
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
    example: 'Updated description for phone cases category',
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
    example: 'https://example.com/images/phone-cases-updated.jpg',
    required: false,
  })
  @IsOptional()
  @IsUrl({}, { message: 'Image must be a valid URL' })
  image?: string;

  @ApiProperty({
    description: 'Parent category ID for hierarchy (set to null to make this a root category)',
    example: '550e8400-e29b-41d4-a716-446655440000',
    required: false,
    nullable: true,
    type: String,
  })
  @IsOptional()
  // Allow an explicit `null` (clear the parent → root category); only validate
  // the UUID format when a non-null value is supplied.
  @ValidateIf((o: UpdateCategoryDto) => o.parentId !== null)
  @IsUUID(4, { message: 'Parent ID must be a valid UUID' })
  parentId?: string | null;

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

  @ApiProperty({
    description: 'Whether the category is active and visible',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'isActive must be true or false' })
  isActive?: boolean;
}
