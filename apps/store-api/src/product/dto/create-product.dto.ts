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
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * DTO for creating a new product.
 *
 * Admin-only endpoint. Slug is auto-generated from name if not provided.
 * Price must be a positive number. SKU must be unique if provided.
 */
export class CreateProductDto {
  @ApiProperty({
    description: 'Product name',
    example: 'iPhone 15 Pro Case — Clear MagSafe',
  })
  @IsString()
  @MaxLength(255, { message: 'Product name must be at most 255 characters' })
  name!: string;

  @ApiProperty({
    description: 'URL-friendly slug (auto-generated from name if not provided)',
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
    description: 'Product description (supports markdown)',
    example: 'Premium clear case with MagSafe compatibility...',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000, { message: 'Description must be at most 5000 characters' })
  description?: string;

  @ApiProperty({
    description: 'Product price (must be positive)',
    example: 29.99,
  })
  @Type(() => Number)
  @IsNumber({}, { message: 'Price must be a number' })
  @Min(0.01, { message: 'Price must be greater than 0' })
  price!: number;

  @ApiProperty({
    description: 'Original price for discount display (must be greater than price if set)',
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
    example: 'IP15-PRO-CASE-CLR',
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
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Stock must be an integer' })
  @Min(0, { message: 'Stock cannot be negative' })
  stock?: number;

  @ApiProperty({
    description: 'Category ID the product belongs to',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID(4, { message: 'Category ID must be a valid UUID' })
  categoryId!: string;

  @ApiProperty({
    description: 'Group this position belongs to (siblings share a group)',
    example: '550e8400-e29b-41d4-a716-446655440000',
    required: false,
  })
  @IsOptional()
  @IsUUID(4, { message: 'Group ID must be a valid UUID' })
  groupId?: string;

  @ApiProperty({
    description: 'Brand (manufacturer) ID this product belongs to',
    example: '550e8400-e29b-41d4-a716-446655440000',
    required: false,
  })
  @IsOptional()
  @IsUUID(4, { message: 'Brand ID must be a valid UUID' })
  brandId?: string;

  @ApiProperty({
    description: 'Attribute values for this position, keyed by group axis name',
    example: { color: 'blue', pack: 'single' },
    required: false,
    // TASK-304: @nestjs/swagger 11 dropped the 'object' string literal from

    // ApiPropertyOptions['type']; the Object constructor emits the identical

    // "type": "object" in the OpenAPI schema.

    type: Object,
    additionalProperties: { type: 'string' },
  })
  @IsOptional()
  @IsObject({ message: 'Attributes must be a key-value object' })
  attributes?: Record<string, string>;

  @ApiProperty({
    description: 'Sort order of this position within its group',
    example: 0,
    required: false,
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Position order must be an integer' })
  @Min(0, { message: 'Position order cannot be negative' })
  positionOrder?: number;

  @ApiProperty({
    description: 'Whether the product is active and visible in the store',
    example: true,
    required: false,
    default: true,
  })
  @IsOptional()
  @IsBoolean({ message: 'isActive must be true or false' })
  isActive?: boolean;

  @ApiProperty({
    description: 'SEO meta title override (falls back to product name when empty)',
    example: 'iPhone 15 Pro Clear MagSafe Case | Store',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Meta title must be at most 255 characters' })
  metaTitle?: string;

  @ApiProperty({
    description: 'SEO meta description override (falls back to the product description when empty)',
    example: 'Shop the clear MagSafe-compatible case for iPhone 15 Pro.',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Meta description must be at most 500 characters' })
  metaDescription?: string;
}
