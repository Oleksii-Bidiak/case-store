import { IsInt, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * DTO for updating a cart item's quantity.
 *
 * quantity must be between 1 and 99.
 * If the service receives quantity = 0, it will remove the item instead.
 */
export class UpdateCartItemDto {
  @ApiProperty({
    description: 'New quantity for the cart item (1-99)',
    example: 3,
  })
  @Type(() => Number)
  @IsInt({ message: 'Quantity must be an integer' })
  @Min(1, { message: 'Quantity must be at least 1' })
  @Max(99, { message: 'Quantity must be at most 99' })
  quantity!: number;
}
