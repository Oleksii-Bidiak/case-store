import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * DTO for previewing a promo code against the caller's current cart.
 *
 * The code is trimmed and upper-cased on input so matching is case-insensitive
 * (discounts are stored uppercase). Only the code is accepted — the subtotal is
 * read server-side from the user's cart, never trusted from the client.
 */
export class PreviewDiscountDto {
  @ApiProperty({ description: 'Promo code to apply', example: 'SUMMER10' })
  @IsString()
  @IsNotEmpty({ message: 'Code is required' })
  @MaxLength(64, { message: 'Code must be at most 64 characters' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  code!: string;
}
