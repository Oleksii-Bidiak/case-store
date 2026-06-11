import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDefined, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { AddressDto } from './address.dto';

/**
 * DTO for creating an order from the authenticated user's current cart.
 *
 * The cart contents are read server-side from the user's cart — the client
 * only supplies the shipping/billing address and optional notes. Prices are
 * snapshotted from the cart at order-creation time.
 */
export class CreateOrderDto {
  @ApiProperty({ description: 'Shipping address', type: AddressDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => AddressDto)
  shippingAddress!: AddressDto;

  @ApiProperty({
    description: 'Billing address (defaults to the shipping address when omitted)',
    type: AddressDto,
    required: false,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  billingAddress?: AddressDto;

  @ApiProperty({ description: 'Optional customer notes', required: false, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
