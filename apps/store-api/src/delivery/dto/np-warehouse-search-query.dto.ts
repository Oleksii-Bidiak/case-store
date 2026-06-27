import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** Query for the warehouse-search endpoint (scoped to a city). */
export class NpWarehouseSearchQueryDto {
  @ApiProperty({
    description: 'Nova Poshta city (delivery) reference UUID',
    example: 'db5c88e0-391c-11dd-90d9-001a92567626',
  })
  @IsString()
  @IsNotEmpty({ message: 'cityRef is required' })
  @MaxLength(100)
  cityRef!: string;

  @ApiProperty({
    description: 'Optional warehouse-name/number filter',
    example: '1',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}
