import { ApiProperty } from '@nestjs/swagger';

/**
 * A single lightweight autocomplete suggestion (TASK-075). Carries just enough
 * to render a dropdown row and link to the PDP — no raw stock, no variant data.
 */
export class SearchSuggestionEntity {
  @ApiProperty({ description: 'Product id', example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ description: 'Product name', example: 'iPhone 15 Pro Case — Clear MagSafe' })
  name!: string;

  @ApiProperty({ description: 'URL-friendly slug', example: 'iphone-15-pro-case-clear-magsafe' })
  slug!: string;

  @ApiProperty({ description: 'Price as string (avoids float precision)', example: '29.99' })
  price!: string;

  @ApiProperty({
    description: 'Original price for discount display',
    example: '39.99',
    type: String,
    nullable: true,
  })
  compareAtPrice!: string | null;

  @ApiProperty({
    description: 'Primary image URL, or null when the product has no image',
    example: 'https://cdn.example/uploads/products/case.jpg',
    type: String,
    nullable: true,
  })
  primaryImageUrl!: string | null;
}
