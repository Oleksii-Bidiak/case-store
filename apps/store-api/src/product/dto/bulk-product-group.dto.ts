import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import { MAX_REORDER_IDS } from '../../common/dto';

/**
 * Body of `PATCH /api/products/group` (TASK-423).
 *
 * Reassigns the variant group of exactly the named products — the bulk form of
 * the group select on the product form. It is the one bulk action the product
 * list was missing: activate/deactivate already existed (TASK-355), and grouping
 * is the operation nobody wants to do one product at a time, because a variant
 * group only means anything once ALL of its positions point at it. Before this,
 * a colour family of nine positions cost nine full form saves.
 *
 * Shaped after {@link import('./bulk-product-status.dto').BulkProductStatusDto}
 * on purpose — same id cap, same `ArrayUnique` guard, same reasoning — so the two
 * bulk endpoints on this controller cannot drift in what they accept.
 *
 * **There is still no bulk delete.** See the controller: soft-deletion mangles
 * slug and sku, and is not something to hand an operator behind a checkbox column.
 */
export class BulkProductGroupDto {
  @ApiProperty({
    description: 'Ids of the products being reassigned.',
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_REORDER_IDS)
  // A repeated id would be rejected as if it did not exist: the repository's
  // all-or-nothing check compares found-vs-asked counts and Prisma's
  // `id: { in: }` collapses duplicates, so `[X, X]` finds one row for two asked
  // and aborts with a 404 naming no ids at all. A clear 400 beats a confusing 404.
  @ArrayUnique({ message: 'ids must not contain duplicates' })
  @IsUUID('loose', { each: true })
  ids!: string[];

  @ApiProperty({
    description:
      'Target variant group, or `null` to take the products out of whatever group they are ' +
      'in. The field is REQUIRED: an absent `groupId` would be indistinguishable from "clear ' +
      'the group", which is a destructive default for a request that omitted the field by mistake.',
    type: String,
    format: 'uuid',
    nullable: true,
    example: '3f1c6d24-9b8e-4f2a-8a1d-6d3b5c2e7a90',
  })
  // `null` is a MEANING here (ungroup), not a missing value — so it skips the
  // uuid check while `undefined` still fails it, which is what makes the field
  // required without `@IsOptional()` quietly letting an omission through.
  @ValidateIf((dto: BulkProductGroupDto) => dto.groupId !== null)
  @IsUUID('loose')
  groupId!: string | null;
}
