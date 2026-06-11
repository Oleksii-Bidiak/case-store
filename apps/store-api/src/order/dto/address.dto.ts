import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, Length } from 'class-validator';

/**
 * Shipping/billing address shape embedded in {@link CreateOrderDto}.
 *
 * Mirrors the `Address` Prisma model fields but is stored as a JSON snapshot
 * on the order (not linked to the `addresses` table), so the order record is
 * immutable even if the user later edits their saved addresses.
 */
export class AddressDto {
  @ApiProperty({ description: 'Recipient first name', example: 'Olena' })
  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @ApiProperty({ description: 'Recipient last name', example: 'Shevchenko' })
  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @ApiProperty({ description: 'Company name', required: false, example: 'Acme LLC' })
  @IsString()
  @IsOptional()
  company?: string;

  @ApiProperty({ description: 'Address line 1', example: 'vul. Khreshchatyk 1' })
  @IsString()
  @IsNotEmpty()
  address1!: string;

  @ApiProperty({ description: 'Address line 2', required: false, example: 'Apt. 12' })
  @IsString()
  @IsOptional()
  address2?: string;

  @ApiProperty({ description: 'City', example: 'Kyiv' })
  @IsString()
  @IsNotEmpty()
  city!: string;

  @ApiProperty({ description: 'State / region', required: false, example: 'Kyiv Oblast' })
  @IsString()
  @IsOptional()
  state?: string;

  @ApiProperty({ description: 'Postal code', example: '01001' })
  @IsString()
  @IsNotEmpty()
  postalCode!: string;

  @ApiProperty({ description: 'ISO-3166-1 alpha-2 country code', example: 'UA' })
  @IsString()
  @Length(2, 2)
  country!: string;

  @ApiProperty({ description: 'Contact phone', required: false, example: '+380501234567' })
  @IsString()
  @IsOptional()
  phone?: string;
}
