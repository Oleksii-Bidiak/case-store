import { IsString, IsOptional, IsNumber, Min, Max, MaxLength } from 'class-validator';
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
}
