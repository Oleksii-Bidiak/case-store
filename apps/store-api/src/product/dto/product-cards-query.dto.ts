import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Hard cap on the number of ids per request. The recently-viewed history is
 * capped at 12 client-side; 24 leaves headroom without letting the endpoint
 * degenerate into an unbounded IN() query.
 */
export const PRODUCT_CARDS_MAX_IDS = 24;

/**
 * Query DTO for `GET /products/cards` (TASK-211): hydrate a bounded set of
 * product cards by id. The wire format is a single comma-separated string
 * (`?ids=a,b,c`) so array serialization quirks (axios `ids[]=`) never matter,
 * but repeated params (`?ids=a&ids=b`) are tolerated too.
 */
export class ProductCardsQueryDto {
  @ApiProperty({
    description: `Comma-separated product ids (UUID v4), at most ${PRODUCT_CARDS_MAX_IDS}`,
    type: String,
    example: '550e8400-e29b-41d4-a716-446655440000,660e8400-e29b-41d4-a716-446655440001',
  })
  // Read the ORIGINAL query value from `obj`, not the `value` argument — the
  // global ValidationPipe runs with `enableImplicitConversion: true`, which
  // may coerce the raw value before this transform (same pattern as
  // ProductListQueryDto.isActive, TASK-150 B5 / TASK-230).
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const raw = obj[key];
    const parts = Array.isArray(raw) ? raw : [raw];
    return parts
      .filter((part): part is string => typeof part === 'string')
      .flatMap((part) => part.split(','))
      .map((id) => id.trim())
      .filter((id) => id !== '');
  })
  @IsArray()
  @ArrayNotEmpty({ message: 'ids must contain at least one product id' })
  @ArrayMaxSize(PRODUCT_CARDS_MAX_IDS, {
    message: `ids must contain at most ${PRODUCT_CARDS_MAX_IDS} ids`,
  })
  @IsUUID(4, { each: true, message: 'each id must be a valid UUID' })
  ids!: string[];
}
