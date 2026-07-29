import {
  IsString,
  IsOptional,
  IsBoolean,
  IsUUID,
  MaxLength,
  Matches,
  IsUrl,
  ValidateIf,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
  // See the note on CreateCategoryDto.image — `require_tld: false` admits the
  // store-api uploads origin (`http://localhost:3001/…`) while still rejecting
  // `javascript:` and relative paths (TASK-364).
  @IsUrl({ require_tld: false }, { message: 'Image must be a valid URL' })
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

  // NOTE (TASK-291, plan 158 §3.10.1): `sortOrder` is deliberately NOT accepted here —
  // see CreateCategoryDto. A parent change made through this endpoint re-appends the node
  // to the end of its destination bucket and re-densifies the source bucket, under the
  // same advisory locks as the batch reorder endpoint.

  @ApiProperty({
    description: 'Whether the category is active and visible',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'isActive must be true or false' })
  isActive?: boolean;

  @ApiProperty({
    description: 'SEO meta title override (falls back to name when empty)',
    example: 'Phone Cases — Premium Protection | Store',
    required: false,
    nullable: true,
    type: String,
  })
  @IsOptional()
  // Allow an explicit `null` (clear the override); only string-validate a value.
  @ValidateIf((o: UpdateCategoryDto) => o.metaTitle !== null)
  @IsString()
  @MaxLength(255, { message: 'Meta title must be at most 255 characters' })
  metaTitle?: string | null;

  @ApiProperty({
    description: 'SEO meta description override',
    example: 'Shop premium protective phone cases for every model.',
    required: false,
    nullable: true,
    type: String,
  })
  @IsOptional()
  // Allow an explicit `null` (clear the override); only string-validate a value.
  @ValidateIf((o: UpdateCategoryDto) => o.metaDescription !== null)
  @IsString()
  @MaxLength(500, { message: 'Meta description must be at most 500 characters' })
  metaDescription?: string | null;
}
