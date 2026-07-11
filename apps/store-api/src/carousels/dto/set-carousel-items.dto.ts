import { ArrayMaxSize, IsArray, IsInt, IsUUID, Min, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * One hand-picked product entry in a MANUAL carousel item write.
 */
export class SetCarouselItemDto {
  @ApiProperty({
    description: 'Product UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID('4', { message: 'productId must be a valid UUID' })
  productId!: string;

  @ApiProperty({ description: 'Display order within the carousel (lower = first)', example: 0 })
  @Type(() => Number)
  @IsInt({ message: 'Sort order must be an integer' })
  @Min(0, { message: 'Sort order must be at least 0' })
  sortOrder!: number;
}

/**
 * Full-replace payload for a carousel's hand-picked item set. The 100-item cap
 * is a generous defensive bound (DB sanity), not a product-facing limit.
 */
export class SetCarouselItemsDto {
  @ApiProperty({
    description: 'Complete replacement item set (empty array clears the carousel)',
    type: [SetCarouselItemDto],
  })
  @IsArray()
  @ArrayMaxSize(100, { message: 'A carousel can hold at most 100 hand-picked items' })
  @ValidateNested({ each: true })
  @Type(() => SetCarouselItemDto)
  items!: SetCarouselItemDto[];
}
