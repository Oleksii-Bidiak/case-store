import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** Query for the city-search endpoint. */
export class NpCitySearchQueryDto {
  @ApiProperty({
    description: 'Settlement name fragment (minimum 2 characters)',
    example: 'Київ',
  })
  @IsString()
  @IsNotEmpty({ message: 'Search query is required' })
  @MaxLength(100, { message: 'Search query must be at most 100 characters' })
  q!: string;
}
