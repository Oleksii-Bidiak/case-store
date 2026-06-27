import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** Query for the shipping-estimate endpoint. */
export class NpEstimateQueryDto {
  @ApiProperty({
    description: 'Recipient Nova Poshta city (delivery) reference UUID',
    example: '8d5a980d-391c-11dd-90d9-001a92567626',
  })
  @IsString()
  @IsNotEmpty({ message: 'cityRef is required' })
  @MaxLength(100)
  cityRef!: string;
}
