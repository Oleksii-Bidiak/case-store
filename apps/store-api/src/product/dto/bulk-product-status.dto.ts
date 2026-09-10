import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsUUID,
} from 'class-validator';
import { MAX_REORDER_IDS } from '../../common/dto';

/**
 * Body of `PATCH /api/products/status` (TASK-355).
 *
 * Sets `isActive` on exactly the named products — the per-row activate/deactivate
 * toggle applied to N rows, with the same meaning and the same side effects
 * (product-list cache eviction, per-product detail eviction, Meilisearch sync).
 *
 * `isActive` is a reversible visibility flag, NOT a delete: soft-deletion is
 * `deletedAt` and lives on `DELETE /api/products/:id`. There is deliberately no
 * bulk equivalent of that — see the controller.
 *
 * The id cap reuses {@link MAX_REORDER_IDS}, as the category bulk endpoint does:
 * both are bounded batch writes driven by an on-screen selection, and an admin
 * cannot select more rows than one page holds anyway.
 */
export class BulkProductStatusDto {
  @ApiProperty({
    description: 'Ids of the products whose status is being set.',
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_REORDER_IDS)
  // A repeated id would be rejected as if it did not exist. The repository's
  // all-or-nothing check compares found-vs-asked counts, and Prisma's `id: { in: }`
  // collapses duplicates — so `[X, X]` finds one row for two asked and aborts the
  // batch with a 404 naming no ids at all. The panel's Set-backed selection cannot
  // produce that today; this makes it a clear 400 rather than a confusing 404 if a
  // future caller does.
  @ArrayUnique({ message: 'ids must not contain duplicates' })
  @IsUUID('loose', { each: true })
  ids!: string[];

  @ApiProperty({
    description: 'The status to write: `true` activates every listed product, `false` deactivates.',
  })
  @IsBoolean()
  isActive!: boolean;
}
