import {
  IsBoolean,
  IsString,
  IsOptional,
  IsNumber,
  Min,
  Max,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for updating the singleton delivery settings (admin-only).
 *
 * All fields are optional — send only what you want to change. The admin form
 * fills `senderCityRef` + `senderCityName` together from the existing public
 * `GET /api/delivery/cities` proxy, so the operator picks a real Nova Poshta
 * city instead of typing a UUID.
 */
export class UpdateDeliverySettingDto {
  @ApiPropertyOptional({
    description: 'Nova Poshta city ref of the dispatch origin (from GET /api/delivery/cities)',
    example: 'db5c88e0-391c-11dd-90d9-001a92567626',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  senderCityRef?: string;

  @ApiPropertyOptional({
    description: 'Human-readable dispatch city, stored so the form can show it back',
    example: 'м. Київ, Київська обл.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  senderCityName?: string;

  @ApiPropertyOptional({
    description: 'Optional specific dispatch branch ref',
    example: '1ec09d88-e1c2-11e3-8c4a-0050568002cf',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  senderWarehouseRef?: string;

  /**
   * Bounded deliberately: Nova Poshta prices a parcel by weight, so a fat-fingered
   * `50` instead of `0.5` would quietly overcharge every shopper. The ceiling is
   * NP's own 30 kg limit for a standard parcel; the floor is their minimum
   * billable weight.
   */
  @ApiPropertyOptional({
    description: 'Fallback parcel weight in kg, used when the real weight is unknown (0.1–30)',
    example: 0.5,
    minimum: 0.1,
    maximum: 30,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.1)
  @Max(30)
  defaultWeightKg?: number;

  // ─── Delivery methods (TASK-643) ───────────────────────────────────────────
  //
  // The flags and the courier price are NOT NULL columns, so they are validated
  // whenever PRESENT (`ValidateIf(!== undefined)`) rather than `IsOptional`,
  // which would wave a `null` through to a Prisma error. The flags also read the
  // RAW body value: the global pipe's `enableImplicitConversion` would otherwise
  // turn any non-empty string ("yes", "false") into `true` before `IsBoolean`
  // ever saw it.

  @ApiPropertyOptional({ description: 'Offer Nova Poshta at checkout', example: true })
  @ValidateIf((o: UpdateDeliverySettingDto) => o.npEnabled !== undefined)
  @Transform(rawValue)
  @IsBoolean()
  npEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Offer pickup from a shop point at checkout',
    example: false,
  })
  @ValidateIf((o: UpdateDeliverySettingDto) => o.pickupEnabled !== undefined)
  @Transform(rawValue)
  @IsBoolean()
  pickupEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Offer courier delivery at checkout', example: false })
  @ValidateIf((o: UpdateDeliverySettingDto) => o.courierEnabled !== undefined)
  @Transform(rawValue)
  @IsBoolean()
  courierEnabled?: boolean;

  @ApiPropertyOptional({
    description:
      'Offer free-text delivery (shipping quoted later by the operator; payable on delivery only)',
    example: true,
  })
  @ValidateIf((o: UpdateDeliverySettingDto) => o.otherEnabled !== undefined)
  @Transform(rawValue)
  @IsBoolean()
  otherEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'The city the courier works in (shown to the customer). Null clears it.',
    example: 'Київ',
    type: String,
    nullable: true,
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  courierCityName?: string | null;

  /**
   * A fixed number, not a range: LiqPay signs one amount (B-6 §2). The ceiling
   * catches a slipped digit, the same guard `defaultWeightKg` has.
   */
  @ApiPropertyOptional({
    description: 'Flat courier price, UAH (0–100000, at most 2 decimals)',
    example: 120,
    minimum: 0,
    maximum: 100000,
  })
  @ValidateIf((o: UpdateDeliverySettingDto) => o.courierPrice !== undefined)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000)
  courierPrice?: number;

  @ApiPropertyOptional({
    description:
      'Product subtotal (UAH) from which the courier is free, inclusive (0–100000, at most ' +
      '2 decimals). Null removes the threshold.',
    example: 1500,
    type: Number,
    nullable: true,
    minimum: 0,
    maximum: 100000,
  })
  @ValidateIf(
    (o: UpdateDeliverySettingDto) => o.courierFreeFrom !== undefined && o.courierFreeFrom !== null,
  )
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000)
  courierFreeFrom?: number | null;
}

/** Read the untouched body value, bypassing implicit type conversion. */
function rawValue({ obj, key }: { obj: Record<string, unknown>; key: string }): unknown {
  return obj[key];
}
