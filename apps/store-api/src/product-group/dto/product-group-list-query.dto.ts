import { IsOptional, IsInt, IsString, MaxLength, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Query DTO for the product-group list (TASK-357).
 *
 * `page` and `limit` carry NO field initializer on purpose: their ABSENCE means
 * "return everything". `GET /api/product-groups` has a SECOND consumer besides
 * the groups table — the product form's group picker
 * (`store-admin/src/features/product-form`) reads it to fill a `<Select>`, and a
 * default page size would quietly hide groups from that dropdown. Pagination is
 * therefore something the caller opts into, never something it inherits.
 */
export class ProductGroupListQueryDto {
  @ApiProperty({
    description: 'Page number (1-based). Omit both page and limit to get the complete list.',
    example: 1,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page must be an integer' })
  @Min(1, { message: 'Page must be at least 1' })
  page?: number;

  @ApiProperty({
    description: 'Items per page. Omit both page and limit to get the complete list.',
    example: 20,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit must be an integer' })
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(100, { message: 'Limit must be at most 100' })
  limit?: number;

  @ApiProperty({ description: 'Search by group name', example: 'iphone', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Search query must be at most 200 characters' })
  search?: string;
}
