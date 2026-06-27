import { ApiProperty } from '@nestjs/swagger';

/** A Nova Poshta warehouse (branch / поштомат) within a city. */
export class NpWarehouseDto {
  @ApiProperty({
    description: 'Nova Poshta warehouse reference UUID',
    example: '7b422fc6-e1b8-11e3-8c4a-0050568002cf',
  })
  ref!: string;

  @ApiProperty({
    description: 'Full warehouse description',
    example: 'Відділення №1: вул. Хрещатик, 22',
  })
  description!: string;

  @ApiProperty({ description: 'Warehouse number within the city', example: '1' })
  number!: string;

  @ApiProperty({
    description: 'NP warehouse type reference (branch vs parcel locker)',
    example: '9a68df70-0267-42a8-bb5c-37f427e36ee4',
  })
  typeOfWarehouse!: string;
}

/** Response envelope for a warehouse search. */
export class NpWarehouseListResponse {
  @ApiProperty({ type: [NpWarehouseDto] })
  data!: NpWarehouseDto[];
}
