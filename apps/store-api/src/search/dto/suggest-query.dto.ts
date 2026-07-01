import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** Query DTO for `GET /api/search/suggest` — autocomplete. `q` is required. */
export class SuggestQueryDto {
  @ApiProperty({ description: 'Partial query string (min 1 char)', example: 'айф' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  q!: string;
}
