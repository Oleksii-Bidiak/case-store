import { IsInt, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { MAX_QUANTITY } from '../cart.constants';

/**
 * DTO for updating a cart item's quantity.
 *
 * quantity must be between 1 and MAX_QUANTITY — a 0 is a 400, never a removal
 * (removing a line is DELETE /api/cart/items/:itemId, TASK-780).
 */
export class UpdateCartItemDto {
  @ApiProperty({
    description: `New quantity for the cart item (1-${MAX_QUANTITY})`,
    example: 3,
    minimum: 1,
    maximum: MAX_QUANTITY,
  })
  @Type(() => Number)
  @IsInt({ message: 'Quantity must be an integer' })
  @Min(1, { message: 'Quantity must be at least 1' })
  @Max(MAX_QUANTITY, { message: `Quantity must be at most ${MAX_QUANTITY}` })
  quantity!: number;
}
