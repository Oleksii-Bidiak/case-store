import {
  IsString,
  IsOptional,
  IsNumber,
  IsInt,
  IsObject,
  IsBoolean,
  IsUUID,
  MaxLength,
  Min,
  Matches,
  ValidateIf,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * DTO for updating an existing product.
 *
 * All fields are optional — only provided fields will be updated.
 * Admin-only endpoint.
 */
export class UpdateProductDto {
  @ApiProperty({
    description: 'Product name',
    example: 'iPhone 15 Pro Case — Clear MagSafe',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Product name must be at most 255 characters' })
  name?: string;

  @ApiProperty({
    description: 'URL-friendly slug',
    example: 'iphone-15-pro-case-clear-magsafe',
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
    description: 'Product description',
    example: 'Updated product description...',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000, { message: 'Description must be at most 5000 characters' })
  description?: string;

  @ApiProperty({
    description: 'Product price (must be positive)',
    example: 24.99,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Price must be a number' })
  @Min(0.01, { message: 'Price must be greater than 0' })
  price?: number;

  @ApiProperty({
    description: 'Original price for discount display',
    example: 39.99,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Compare-at price must be a number' })
  @Min(0.01, { message: 'Compare-at price must be greater than 0' })
  compareAtPrice?: number;

  @ApiProperty({
    description: 'Stock Keeping Unit — must be unique',
    example: 'IP15-PRO-CASE-CLR-V2',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'SKU must be at most 50 characters' })
  sku?: string;

  @ApiProperty({
    description: 'Available stock quantity for this position',
    example: 42,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Stock must be an integer' })
  @Min(0, { message: 'Stock cannot be negative' })
  stock?: number;

  @ApiProperty({
    description: 'Category ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
    required: false,
  })
  @IsOptional()
  @IsUUID(4, { message: 'Category ID must be a valid UUID' })
  categoryId?: string;

  @ApiProperty({
    description: 'Group this position belongs to (siblings share a group)',
    example: '550e8400-e29b-41d4-a716-446655440000',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsUUID(4, { message: 'Group ID must be a valid UUID' })
  groupId?: string;

  @ApiProperty({
    description: 'Brand (manufacturer) ID this product belongs to',
    example: '550e8400-e29b-41d4-a716-446655440000',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsUUID(4, { message: 'Brand ID must be a valid UUID' })
  brandId?: string;

  @ApiProperty({
    description: 'Attribute values for this position, keyed by group axis name',
    example: { color: 'blue', pack: 'single' },
    required: false,
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  @IsOptional()
  @IsObject({ message: 'Attributes must be a key-value object' })
  attributes?: Record<string, string>;

  @ApiProperty({
    description: 'Sort order of this position within its group',
    example: 0,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Position order must be an integer' })
  @Min(0, { message: 'Position order cannot be negative' })
  positionOrder?: number;

  @ApiProperty({
    description: 'Whether the product is active and visible',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'isActive must be true or false' })
  isActive?: boolean;

  @ApiProperty({
    description: 'SEO meta title override (falls back to product name when empty)',
    example: 'iPhone 15 Pro Clear MagSafe Case | Store',
    required: false,
    nullable: true,
    type: String,
  })
  @IsOptional()
  // Allow an explicit `null` (clear the override → auto-derived); only
  // string-validate a real value.
  @ValidateIf((o: UpdateProductDto) => o.metaTitle !== null)
  @IsString()
  @MaxLength(255, { message: 'Meta title must be at most 255 characters' })
  metaTitle?: string | null;

  @ApiProperty({
    description: 'SEO meta description override (falls back to the product description when empty)',
    example: 'Shop the clear MagSafe-compatible case for iPhone 15 Pro.',
    required: false,
    nullable: true,
    type: String,
  })
  @IsOptional()
  // Allow an explicit `null` (clear the override → auto-derived); only
  // string-validate a real value.
  @ValidateIf((o: UpdateProductDto) => o.metaDescription !== null)
  @IsString()
  @MaxLength(500, { message: 'Meta description must be at most 500 characters' })
  metaDescription?: string | null;
}
