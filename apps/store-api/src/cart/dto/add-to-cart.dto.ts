import { IsUUID, IsInt, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * DTO for adding an item to the cart.
 *
 * productId identifies a buyable product position (TASK-142). quantity must be
 * between 1 and 99. If the same position already exists in the cart, the service
 * increments the quantity instead of creating a duplicate.
 */
export class AddToCartDto {
  @ApiProperty({
    description: 'Product (position) ID to add to cart',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID(4, { message: 'Product ID must be a valid UUID' })
  productId!: string;

  @ApiProperty({
    description: 'Quantity to add (1-99)',
    example: 1,
    default: 1,
  })
  @Type(() => Number)
  @IsInt({ message: 'Quantity must be an integer' })
  @Min(1, { message: 'Quantity must be at least 1' })
  @Max(99, { message: 'Quantity must be at most 99' })
  quantity!: number;
}
