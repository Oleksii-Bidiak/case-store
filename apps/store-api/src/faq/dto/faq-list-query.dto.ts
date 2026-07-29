import { IsOptional, IsInt, IsString, MaxLength, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Query DTO for the ADMIN FAQ list (TASK-357).
 *
 * The public `GET /api/faq` deliberately keeps taking no query at all: the
 * storefront renders the complete active set (the /info hub and the PDP FAQPage
 * JSON-LD), so there is nothing to page through and nothing to search. Giving
 * only the admin route a query DTO is what keeps that promise mechanically —
 * `forbidNonWhitelisted` makes `GET /api/faq?page=2` a 400 rather than a silent
 * behaviour change.
 *
 * `page` and `limit` carry NO field initializer on purpose: their ABSENCE means
 * "return everything", which is the pre-TASK-357 behaviour of the admin list.
 */
export class AdminFaqListQueryDto {
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

  @ApiProperty({
    description: 'Search by question text',
    example: 'доставк',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Search query must be at most 200 characters' })
  search?: string;
}
