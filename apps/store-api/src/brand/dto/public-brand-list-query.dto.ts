import { IsOptional, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Query params for the PUBLIC brand list, `GET /brands` (TASK-414).
 *
 * The endpoint took no params at all until now, which is why the storefront's
 * «Виробник» dropdown offered every brand in the shop even inside a category
 * that stocks two of them — and picking one of the other brands produced an
 * empty grid. Narrowing is opt-in: with no `categoryId` the response is exactly
 * what it always was (every active brand), so the "Популярні бренди" strip and
 * any existing caller are unaffected.
 */
export class PublicBrandListQueryDto {
  @ApiProperty({
    description:
      'Narrow the list to brands that have at least one purchasable product in this ' +
      'category SUBTREE (the category itself plus its descendants, matching the ' +
      'catalogue rollup). Omit for every active brand.',
    example: '550e8400-e29b-41d4-a716-446655440000',
    required: false,
  })
  @IsOptional()
  @IsUUID('loose', { message: 'Category ID must be a valid UUID' })
  categoryId?: string;
}
