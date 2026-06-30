import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsNumber,
  IsOptional,
  IsInt,
  IsBoolean,
  IsDateString,
  Min,
  MaxLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { DiscountType } from '@prisma/client';

/**
 * DTO for creating a discount / promo code (admin only).
 *
 * `code` is normalized to trimmed uppercase so storefront matching is
 * case-insensitive. `value` semantics depend on `type`: PERCENT is 1–100,
 * FIXED is a UAH amount. Caps and window fields are all optional (null =
 * unlimited / unbounded).
 */
export class CreateDiscountDto {
  @ApiProperty({ description: 'Promo code (stored uppercase)', example: 'SUMMER10' })
  @IsString()
  @IsNotEmpty({ message: 'Code is required' })
  @MaxLength(64, { message: 'Code must be at most 64 characters' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  code!: string;

  @ApiProperty({ description: 'Discount type', enum: DiscountType, example: DiscountType.PERCENT })
  @IsEnum(DiscountType, { message: 'type must be PERCENT or FIXED' })
  type!: DiscountType;

  @ApiProperty({
    description: 'Discount value — PERCENT: 1–100; FIXED: UAH amount (> 0)',
    example: 10,
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'value must be a number with up to 2 decimals' })
  @Min(0.01, { message: 'value must be greater than 0' })
  value!: number;

  @ApiProperty({
    description: 'Minimum cart subtotal required to apply (UAH)',
    example: 500,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'minSpend must be a number with up to 2 decimals' })
  @Min(0, { message: 'minSpend must be at least 0' })
  minSpend?: number;

  @ApiProperty({
    description: 'Global redemption cap (null = unlimited)',
    example: 100,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'maxRedemptions must be an integer' })
  @Min(1, { message: 'maxRedemptions must be at least 1' })
  maxRedemptions?: number;

  @ApiProperty({
    description: 'Per-user redemption cap (null = unlimited)',
    example: 1,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'perUserLimit must be an integer' })
  @Min(1, { message: 'perUserLimit must be at least 1' })
  perUserLimit?: number;

  @ApiProperty({
    description: 'Activation timestamp (ISO 8601) — code invalid before this',
    example: '2026-06-01T00:00:00.000Z',
    required: false,
  })
  @IsOptional()
  @IsDateString({}, { message: 'startsAt must be an ISO 8601 date string' })
  startsAt?: string;

  @ApiProperty({
    description: 'Expiry timestamp (ISO 8601) — code invalid after this',
    example: '2026-09-01T00:00:00.000Z',
    required: false,
  })
  @IsOptional()
  @IsDateString({}, { message: 'expiresAt must be an ISO 8601 date string' })
  expiresAt?: string;

  @ApiProperty({
    description: 'Whether the code is active',
    example: true,
    required: false,
    default: true,
  })
  @IsOptional()
  @IsBoolean({ message: 'isActive must be true or false' })
  isActive?: boolean;
}
