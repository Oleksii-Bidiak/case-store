import { IsUUID, IsInt, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { MAX_QUANTITY } from '../cart.constants';

/**
 * DTO for adding an item to the cart.
 *
 * productId identifies a buyable product position (TASK-142). quantity is
 * required and must be between 1 and MAX_QUANTITY. If the same position already
 * exists in the cart, the service increments the quantity instead of creating a
 * duplicate.
 */
export class AddToCartDto {
  @ApiProperty({
    description: 'Product (position) ID to add to cart',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID('loose', { message: 'Product ID must be a valid UUID' })
  productId!: string;

  // No `default` here (TASK-823): the field is required, so an omitted quantity
  // is a 400 — documenting a default of 1 promised a fallback that never ran.
  @ApiProperty({
    description: `Quantity to add (1-${MAX_QUANTITY})`,
    example: 1,
    minimum: 1,
    maximum: MAX_QUANTITY,
  })
  @Type(() => Number)
  @IsInt({ message: 'Quantity must be an integer' })
  @Min(1, { message: 'Quantity must be at least 1' })
  @Max(MAX_QUANTITY, { message: `Quantity must be at most ${MAX_QUANTITY}` })
  quantity!: number;
}
