import { ApiProperty } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import { IsDefined, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { AddressDto } from './address.dto';
import { GuestContactDto } from './guest-contact.dto';

/**
 * DTO for creating an order from the caller's current cart.
 *
 * The cart contents are read server-side from the caller's cart — the client
 * only supplies the shipping/billing address and optional notes. Prices are
 * snapshotted from the cart at order-creation time.
 *
 * Since TASK-338 the caller may be a guest, in which case {@link contact} is
 * required. Guests could already fill a cart; the barrier stood exactly here.
 */
export class CreateOrderDto {
  @ApiProperty({
    description:
      'Contact details for a GUEST order (TASK-338). Required when the request carries no ' +
      'access token; ignored for authenticated shoppers, whose account is the source of truth.',
    type: GuestContactDto,
    required: false,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => GuestContactDto)
  contact?: GuestContactDto;

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

  @ApiProperty({
    description: 'Optional promo code applied at checkout (recomputed server-side; TASK-079)',
    required: false,
    maxLength: 64,
    example: 'SUMMER10',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  discountCode?: string;
}
