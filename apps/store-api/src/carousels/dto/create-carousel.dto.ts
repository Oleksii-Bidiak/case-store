import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsUUID,
  MaxLength,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import { CarouselPlacement, CarouselSource } from '@prisma/client';
import { PublishFieldsDto } from '../../publishing';

/** Trim leading/trailing whitespace from string inputs (leave non-strings as-is). */
const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * DTO for creating a recommendation carousel (admin-only). `categoryId` is
 * required exactly when `source = CATEGORY` (enforced via `@ValidateIf`) and
 * ignored otherwise. `itemLimit` bounds only the four rule-based sources —
 * MANUAL carousels show exactly their `CarouselItem` rows. `placement` decides
 * WHERE the carousel renders, never HOW its list is resolved. Publish control
 * comes from the shared {@link PublishFieldsDto} (`status` + `scheduledAt`).
 */
export class CreateCarouselDto extends PublishFieldsDto {
  @ApiProperty({ description: 'Carousel heading shown on the homepage', example: 'Хіти продажів' })
  @Transform(trim)
  @IsString()
  @MaxLength(255, { message: 'Title must be at most 255 characters' })
  title!: string;

  @ApiProperty({
    description: 'How the product list is computed',
    enum: CarouselSource,
    example: CarouselSource.BESTSELLING,
  })
  @IsEnum(CarouselSource, {
    message: `source must be one of: ${Object.values(CarouselSource).join(', ')}`,
  })
  source!: CarouselSource;

  @ApiProperty({
    description: 'Category to pull products from — required when source = CATEGORY',
    example: '550e8400-e29b-41d4-a716-446655440000',
    required: false,
  })
  @ValidateIf((o: CreateCarouselDto) => o.source === CarouselSource.CATEGORY)
  @IsUUID('all', { message: 'categoryId must be a valid UUID when source is CATEGORY' })
  categoryId?: string;

  @ApiProperty({
    description:
      'Where the carousel surfaces on the homepage — HOME_TABS feeds one tab of the "Популярне" section (title = tab label), HOME_RAILS is a standalone rail',
    enum: CarouselPlacement,
    example: CarouselPlacement.HOME_RAILS,
    required: false,
    default: CarouselPlacement.HOME_RAILS,
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
    default: 12,
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
