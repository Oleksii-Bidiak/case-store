import { IsString, IsOptional, IsEnum, IsInt, IsUUID, MaxLength, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import { CarouselPlacement, CarouselSource } from '@prisma/client';
import { PublishFieldsDto } from '../../publishing';

/** Trim leading/trailing whitespace from string inputs (leave non-strings as-is). */
const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * DTO for updating a recommendation carousel (admin-only). All fields optional —
 * only provided fields are written. The CATEGORY-requires-categoryId rule is
 * enforced in the service (the effective categoryId may come from the existing
 * row when `source` flips to CATEGORY without a new `categoryId`). Publish
 * control (`status` + `scheduledAt`) comes from the shared {@link PublishFieldsDto}.
 */
export class UpdateCarouselDto extends PublishFieldsDto {
  @ApiProperty({
    description: 'Carousel heading shown on the homepage',
    example: 'Хіти продажів',
    required: false,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255, { message: 'Title must be at most 255 characters' })
  title?: string;

  @ApiProperty({
    description: 'How the product list is computed',
    enum: CarouselSource,
    example: CarouselSource.CATEGORY,
    required: false,
  })
  @IsOptional()
  @IsEnum(CarouselSource, {
    message: `source must be one of: ${Object.values(CarouselSource).join(', ')}`,
  })
  source?: CarouselSource;

  @ApiProperty({
    description: 'Category to pull products from — meaningful only when source = CATEGORY',
    example: '550e8400-e29b-41d4-a716-446655440000',
    required: false,
  })
  @IsOptional()
  @IsUUID('loose', { message: 'categoryId must be a valid UUID' })
  categoryId?: string;

  @ApiProperty({
    description:
      'Where the carousel surfaces on the homepage — HOME_TABS feeds one tab of the "Популярне" section, HOME_RAILS is a standalone rail',
    enum: CarouselPlacement,
    example: CarouselPlacement.HOME_TABS,
    required: false,
  })
  @IsOptional()
  @IsEnum(CarouselPlacement, {
    message: `placement must be one of: ${Object.values(CarouselPlacement).join(', ')}`,
  })
  placement?: CarouselPlacement;

  @ApiProperty({
    description: 'Max products to show for a rule-based source (ignored for MANUAL)',
    example: 12,
    required: false,
    minimum: 1,
    maximum: 24,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Item limit must be an integer' })
  @Min(1, { message: 'Item limit must be at least 1' })
  @Max(24, { message: 'Item limit must be at most 24' })
  itemLimit?: number;

  @ApiProperty({
    description: 'Homepage display order across all carousels (lower values appear first)',
    example: 10,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Sort order must be an integer' })
  @Min(0, { message: 'Sort order must be at least 0' })
  sortOrder?: number;
}
