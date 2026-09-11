import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for adding (or toggling) a product into the wishlist.
 *
 * `productId` identifies a buyable product position (TASK-142). The wishlist is
 * a set — there is no quantity, and adding the same product twice is idempotent
 * thanks to the `@@unique([wishlistId, productId])` constraint.
 */
export class AddToWishlistDto {
  @ApiProperty({
    description: 'Product (position) ID to add to the wishlist',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID('loose', { message: 'Product ID must be a valid UUID' })
  productId!: string;
}
