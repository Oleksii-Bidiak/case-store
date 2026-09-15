import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { MAX_REORDER_IDS } from '../../common/dto';

/** Longest colour name the admin may store. Long enough for «Синій титан». */
export const MAX_COLOR_LENGTH = 60;

/**
 * Body of `PATCH /api/products/color` (TASK-487).
 *
 * Sets — or with `null` clears — the colour of exactly the named products, in
 * BOTH places colour lives: the variant-axis JSON and the structured `color`
 * spec the catalogue facet reads. See `ProductService.setColorMany` for why
 * neither write is optional.
 *
 * Shaped after {@link import('./bulk-product-group').BulkProductGroupDto} on
 * purpose — same id cap, same `ArrayUnique` guard, same `null`-is-a-meaning
 * treatment of the second field — so the three bulk endpoints on this controller
 * cannot drift in what they accept.
 */
export class BulkProductColorDto {
  @ApiProperty({
    description: 'Ids of the products being recoloured.',
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_REORDER_IDS)
  // A repeated id would be rejected as if it did not exist: the all-or-nothing
  // check compares found-vs-asked counts and Prisma's `id: { in: }` collapses
  // duplicates, so `[X, X]` finds one row for two asked and aborts with a 404
  // naming no ids at all. A clear 400 beats a confusing 404.
  @ArrayUnique({ message: 'ids must not contain duplicates' })
  @IsUUID('loose', { each: true })
  ids!: string[];

  @ApiProperty({
    description:
      'Colour to write, or `null` to clear it. The field is REQUIRED: an absent ' +
      '`color` would be indistinguishable from "remove the colour", which is a destructive ' +
      'default for a request that omitted the field by mistake.',
    type: String,
    nullable: true,
    maxLength: MAX_COLOR_LENGTH,
    example: 'Чорний',
  })
  // Trimmed BEFORE validation so «  » fails `MinLength` instead of being stored
  // as a blank colour — a blank is not a colour, and it would publish a swatch
  // with no name that nobody can click off again.
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  // `null` is a MEANING here (clear), not a missing value — so it skips the
  // string checks while `undefined` still fails them, which is what makes the
  // field required without `@IsOptional()` quietly letting an omission through.
  @ValidateIf((dto: BulkProductColorDto) => dto.color !== null)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_COLOR_LENGTH)
  color!: string | null;
}
