import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, Length, MaxLength } from 'class-validator';

/**
 * Shipping/billing address shape embedded in {@link CreateOrderDto}.
 *
 * Mirrors the `Address` Prisma model fields but is stored as a JSON snapshot
 * on the order (not linked to the `addresses` table), so the order record is
 * immutable even if the user later edits their saved addresses.
 *
 * Tuned for the Ukrainian market (manual delivery for now — Nova Poshta API is
 * TASK-080): the only required fields are `firstName`, `lastName`, `phone`,
 * `city` and `address1` (which carries the free-text delivery address / Nova
 * Poshta branch). `postalCode`, `state`, `country`, `company` and `address2`
 * are optional so the simplified storefront form validates. `country` defaults
 * to `UA` on the client.
 */
export class AddressDto {
  @ApiProperty({ description: 'Recipient first name', example: 'Olena' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @ApiProperty({ description: 'Recipient last name', example: 'Shevchenko' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string;

  @ApiProperty({ description: 'Company name', required: false, example: 'Acme LLC' })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  company?: string;

  @ApiProperty({
    description: 'Delivery address — street address or Nova Poshta branch (free text)',
    example: 'Нова Пошта, відділення №12',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  address1!: string;

  @ApiProperty({ description: 'Address line 2', required: false, example: 'Apt. 12' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  address2?: string;

  @ApiProperty({ description: 'City', example: 'Kyiv' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city!: string;

  @ApiProperty({ description: 'State / region', required: false, example: 'Kyiv Oblast' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  state?: string;

  @ApiProperty({ description: 'Postal code', required: false, example: '01001' })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  postalCode?: string;

  @ApiProperty({
    description: 'ISO-3166-1 alpha-2 country code (defaults to UA)',
    required: false,
    example: 'UA',
  })
  @IsString()
  @IsOptional()
  @Length(2, 2)
  country?: string;

  @ApiProperty({ description: 'Contact phone', example: '+380501234567' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phone!: string;

  // ─── Nova Poshta delivery refs (TASK-080) ───────────────────────────────────
  // Optional: present only when the order was placed through the NP autocomplete
  // (TASK-080-C). Old free-text orders and the manual fallback omit them.

  @ApiProperty({
    description: 'Nova Poshta city (delivery) reference UUID',
    required: false,
    example: 'db5c88e0-391c-11dd-90d9-001a92567626',
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  npCityRef?: string;

  @ApiProperty({
    description: 'Selected Nova Poshta warehouse description',
    required: false,
    example: 'Відділення №1: вул. Хрещатик, 22',
  })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  npWarehouseName?: string;

  @ApiProperty({
    description: 'Nova Poshta warehouse reference UUID',
    required: false,
    example: '7b422fc6-e1b8-11e3-8c4a-0050568002cf',
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  npWarehouseRef?: string;
}
