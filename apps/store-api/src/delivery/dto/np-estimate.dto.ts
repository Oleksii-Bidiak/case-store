import { ApiProperty } from '@nestjs/swagger';

/** A Nova Poshta shipping cost + delivery-time estimate. */
export class NpEstimateDto {
  @ApiProperty({
    description: 'Estimated shipping cost in UAH (decimal string)',
    example: '60.00',
  })
  cost!: string;

  @ApiProperty({
    description: 'Estimated delivery time in days, or null when NP returns none',
    example: 2,
    nullable: true,
    type: Number,
  })
  etaDays!: number | null;
}

/** Response envelope for a shipping estimate. */
export class NpEstimateResponse {
  @ApiProperty({ type: NpEstimateDto })
  data!: NpEstimateDto;
}
