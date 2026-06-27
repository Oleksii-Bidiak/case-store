import { ApiProperty } from '@nestjs/swagger';

/**
 * A Nova Poshta settlement suitable for warehouse delivery.
 *
 * `ref` is the NP **city** reference (`DeliveryCity` from `searchSettlements`),
 * which is what `getWarehouses` and the cost estimate consume — NOT the
 * settlement `Ref`. Settlements without a `DeliveryCity` (no NP delivery) are
 * filtered out upstream.
 */
export class NpCityDto {
  @ApiProperty({
    description: 'Nova Poshta city (delivery) reference UUID',
    example: 'db5c88e0-391c-11dd-90d9-001a92567626',
  })
  ref!: string;

  @ApiProperty({
    description: 'Human-readable settlement name',
    example: 'м. Київ, Київська обл.',
  })
  name!: string;

  @ApiProperty({ description: 'Region (oblast)', example: 'Київська' })
  area!: string;

  @ApiProperty({
    description: 'Number of NP warehouses in the settlement',
    example: 1234,
  })
  warehouses!: number;
}

/** Response envelope for a city search. */
export class NpCityListResponse {
  @ApiProperty({ type: [NpCityDto] })
  data!: NpCityDto[];
}
