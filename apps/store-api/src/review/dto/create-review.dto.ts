import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * Request body for submitting a product review. The author is taken from the
 * JWT (`@CurrentUser('id')`), never the body, so there is no `userId` field.
 */
export class CreateReviewDto {
  @ApiProperty({ description: 'Star rating from 1 to 5', minimum: 1, maximum: 5, example: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiProperty({
    description: 'Optional free-text comment (max 1000 chars)',
    required: false,
    maxLength: 1000,
    example: 'Excellent case, fits perfectly and feels premium.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
